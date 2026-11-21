// Turns a team into the agent files agent-platform reads in each repo, and opens
// one pull request per island with all of them. Nothing reaches main without your merge.
//
// Formats follow agents/onboard.md: .github/agents/dev-<scope>.md for dev agents,
// .github/agents/review-<reviewer>.md for repo rules that reviewers add to theirs.

import { gh, GitHubError } from "./github";
import { slug, type Team, type TeamAgent } from "./teams";

export interface AgentRepoFile {
  path: string;
  content: string;
}

const START = "<!-- agent-hq:team:start -->";
const END = "<!-- agent-hq:team:end -->";

const bullets = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean).map((x) => `- ${x}`);
const folder = (a: TeamAgent) => `.github/agents/team/${slug(a.name)}`;

function knowledge(team: Team, a: TeamAgent): string[] {
  const out: string[] = [];
  const ctx = [team.context.trim(), a.context.trim()].filter(Boolean);
  if (ctx.length) out.push("## Contexte", "", ...ctx.flatMap((c) => [c, ""]));
  if (a.skills.length) {
    out.push("## Skills (lis ces fichiers avant de commencer)", "", ...a.skills.map((f) => `- \`${folder(a)}/skills/${f.name}\``), "");
  }
  if (a.guardrails.length) {
    out.push(
      "## Garde-fous (non négociables)",
      "",
      "Lis ces fichiers et respecte-les. Si le ticket te demande de les enfreindre, arrête-toi et pose la question (needs-human).",
      "",
      ...a.guardrails.map((f) => `- \`${folder(a)}/guardrails/${f.name}\``),
      "",
    );
  }
  return out;
}

export function renderDevFile(team: Team, a: TeamAgent, scope: string): string {
  return [
    `# Agent dev — ${scope} (${a.name}${a.mission.trim() ? ` : ${a.mission.trim()}` : ""})`,
    "",
    `<!-- Généré par Agent HQ depuis l'équipe « ${team.name} ». Modifie l'équipe dans Agent HQ plutôt que ce fichier. -->`,
    "",
    "## Périmètre (seuls fichiers modifiables)",
    "",
    ...(bullets(a.perimeter).length ? bullets(a.perimeter) : ["- `**` (tout le repo)"]),
    "",
    "## Points d'attention",
    "",
    ...(bullets(a.attention).length ? bullets(a.attention) : ["- Rien de particulier."]),
    "",
    ...knowledge(team, a),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
    .concat("\n");
}

export function renderReviewBlock(team: Team, a: TeamAgent): string {
  return [
    START,
    `## Consignes de l'équipe « ${team.name} » (${a.name})`,
    "",
    a.mission.trim(),
    "",
    ...bullets(a.attention),
    "",
    ...knowledge(team, a),
    END,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Replaces the Agent HQ block of an existing review file, or appends it. */
export function mergeReviewFile(existing: string | null, block: string): string {
  if (!existing?.trim()) return `${block}\n`;
  const s = existing.indexOf(START);
  const e = existing.indexOf(END);
  if (s >= 0 && e > s) return existing.slice(0, s) + block + existing.slice(e + END.length);
  return `${existing.trimEnd()}\n\n${block}\n`;
}

/** Files of a team for one repo. Review files get their existing content through `existing`. */
export function filesForRepo(team: Team, repo: string, existing: Record<string, string | null> = {}): AgentRepoFile[] {
  const files: AgentRepoFile[] = [];
  for (const a of team.agents) {
    const here = a.placements.filter((p) => p.repo === repo);
    if (!here.length) continue;
    if (a.role === "dev") {
      for (const p of here) files.push({ path: `.github/agents/dev-${p.scope}.md`, content: renderDevFile(team, a, p.scope) });
    } else {
      const path = `.github/agents/review-${a.role}.md`;
      files.push({ path, content: mergeReviewFile(existing[path] ?? null, renderReviewBlock(team, a)) });
    }
    for (const f of a.skills) files.push({ path: `${folder(a)}/skills/${f.name}`, content: f.content });
    for (const f of a.guardrails) files.push({ path: `${folder(a)}/guardrails/${f.name}`, content: f.content });
  }
  return files;
}

/** Islands a team is placed on. */
export const teamRepos = (team: Team) => [...new Set(team.agents.flatMap((a) => a.placements.map((p) => p.repo)))];

async function readFile(token: string, repo: string, path: string, ref: string): Promise<string | null> {
  try {
    const f = await gh<{ content: string }>(token, `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`);
    return Buffer.from(f.content, "base64").toString("utf8");
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return null;
    throw e;
  }
}

/** One commit on a new branch with every file, the scope labels, then a pull request. */
export async function deployToRepo(token: string, team: Team, repo: string): Promise<{ prUrl: string }> {
  const info = await gh<{ default_branch: string }>(token, `/repos/${repo}`);
  const base = info.default_branch;
  const head = await gh<{ object: { sha: string } }>(token, `/repos/${repo}/git/ref/heads/${base}`);
  const commit = await gh<{ tree: { sha: string } }>(token, `/repos/${repo}/git/commits/${head.object.sha}`);

  const reviewPaths = team.agents
    .filter((a) => a.role !== "dev" && a.placements.some((p) => p.repo === repo))
    .map((a) => `.github/agents/review-${a.role}.md`);
  const existing: Record<string, string | null> = {};
  for (const p of reviewPaths) existing[p] = await readFile(token, repo, p, base);
  const files = filesForRepo(team, repo, existing);
  if (!files.length) throw new Error(`No agent of the team is placed on ${repo}.`);

  const tree = await gh<{ sha: string }>(token, `/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: commit.tree.sha, tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })) }),
  });
  const created = await gh<{ sha: string }>(token, `/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message: `Agent HQ: deploy team "${team.name}"`, tree: tree.sha, parents: [head.object.sha] }),
  });
  const branch = `hq/team-${slug(team.name)}-${Date.now().toString(36)}`;
  await gh(token, `/repos/${repo}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: created.sha }) });

  for (const a of team.agents.filter((x) => x.role === "dev")) {
    for (const p of a.placements.filter((x) => x.repo === repo)) {
      try {
        await gh(token, `/repos/${repo}/labels`, { method: "POST", body: JSON.stringify({ name: `scope:${p.scope}`, color: "1D76DB" }) });
      } catch (e) {
        if (!(e instanceof GitHubError && e.status === 422)) throw e; // 422: the label already exists
      }
    }
  }

  const lines = team.agents
    .filter((a) => a.placements.some((p) => p.repo === repo))
    .map((a) => {
      const desks = a.placements.filter((p) => p.repo === repo).map((p) => p.scope);
      return a.role === "dev" ? `- **${a.name}** (dev, desk${desks.length > 1 ? "s" : ""} ${desks.map((d) => `\`${d}\``).join(", ")}): ${a.mission}` : `- **${a.name}** (${a.role} reviewer): ${a.mission}`;
    });
  const pr = await gh<{ html_url: string }>(token, `/repos/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: `Agent HQ: deploy team "${team.name}"`,
      head: branch,
      base,
      body: [
        `Deploys the agents of the team **${team.name}** on this repo.`,
        "",
        ...lines,
        "",
        "Files:",
        ...files.map((f) => `- \`${f.path}\``),
        "",
        "Review files keep their existing rules: Agent HQ only rewrites its own block between `agent-hq:team` markers.",
        "",
        "_Opened from Agent HQ._",
      ].join("\n"),
    }),
  });
  return { prUrl: pr.html_url };
}
