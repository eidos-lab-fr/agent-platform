// User actions, run on GitHub with the user's own token.

import { config } from "./config";
import { demoCreateQuest, demoLaunch, demoMerge } from "./demo";
import { gh, GitHubError } from "./github";
import type { Session } from "./session";

export type Action =
  | {
      type: "create";
      repo: string;
      title: string;
      scope: string;
      spec: string;
      perimetre: string;
      criteres: string;
      horsPerimetre: string;
      verification: string;
      launch: boolean;
    }
  | { type: "launch"; repo: string; number: number; scope?: string }
  | { type: "answer"; repo: string; number: number; text: string }
  | { type: "claude"; repo: string; number: number; text: string }
  | { type: "merge"; repo: string; prNumber: number }
  | { type: "onboard"; repo: string };

export interface ActionResult {
  ok: boolean;
  message: string;
  url?: string;
}

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

/** Issue body in the format of agent-platform's "Fonctionnalité" issue form (headings stay in French). */
export function issueBody(a: Extract<Action, { type: "create" }>): string {
  const section = (title: string, value: string) => `### ${title}\n\n${value.trim() || "_No response_"}`;
  return [
    section("Chemin de la spec", a.spec),
    section("Scope", a.scope),
    section("Ce que ce ticket couvre", a.perimetre),
    section("Critères d'acceptation", a.criteres),
    section("Hors périmètre", a.horsPerimetre),
    section("Vérification manuelle avant merge", a.verification),
    "",
    "_Created from Agent HQ._",
  ].join("\n\n");
}

export function validate(a: Action): string | null {
  if (!a || typeof a !== "object" || !("type" in a)) return "Invalid action.";
  if (!REPO_RE.test(a.repo ?? "") && a.type !== "onboard") return "Invalid repo.";
  if (a.type === "onboard" && !/^[\w.-]+$/.test(a.repo)) return "Invalid repo name (without the org).";
  if (a.type === "create") {
    if (!a.title?.trim()) return "The quest needs a title.";
    if (!a.spec?.trim()) return "The spec path is required.";
    if (!a.criteres?.trim()) return "Add at least one acceptance criterion.";
    if (!/^[\w-]+$/.test(a.scope ?? "")) return "Invalid scope.";
  }
  if ((a.type === "answer" || a.type === "claude") && !a.text?.trim()) return "The message is empty.";
  return null;
}

async function removeLabel(token: string, repo: string, number: number, name: string) {
  try {
    await gh(token, `/repos/${repo}/issues/${number}/labels/${encodeURIComponent(name)}`, { method: "DELETE" });
  } catch (e) {
    if (!(e instanceof GitHubError && e.status === 404)) throw e;
  }
}

async function addLabels(token: string, repo: string, number: number, labels: string[]) {
  await gh(token, `/repos/${repo}/issues/${number}/labels`, { method: "POST", body: JSON.stringify({ labels }) });
}

/** Adds ready-for-dev (removing it first if present): this is what wakes the dev agent. */
async function launch(token: string, repo: string, number: number, scope?: string) {
  if (scope && scope !== "general") await addLabels(token, repo, number, [`scope:${scope}`]);
  await removeLabel(token, repo, number, "ready-for-dev");
  await addLabels(token, repo, number, ["ready-for-dev"]);
}

export async function runAction(session: Session, a: Action): Promise<ActionResult> {
  const t = session.token;
  switch (a.type) {
    case "create": {
      const labels = a.scope && a.scope !== "general" ? [`scope:${a.scope}`] : [];
      const issue = await gh<{ number: number; html_url: string }>(t, `/repos/${a.repo}/issues`, {
        method: "POST",
        body: JSON.stringify({ title: a.title.trim(), body: issueBody(a), labels }),
      });
      if (a.launch) await launch(t, a.repo, issue.number);
      return { ok: true, message: a.launch ? `Quest #${issue.number} created and handed to an agent.` : `Quest #${issue.number} created.`, url: issue.html_url };
    }
    case "launch":
      await launch(t, a.repo, a.number, a.scope);
      return { ok: true, message: `An agent is on its way to #${a.number}.` };
    case "answer": {
      // The agent rereads the issue with gh issue view, which does not show comments,
      // so the answer is appended to the issue body, and also posted as a comment.
      const issue = await gh<{ body: string | null }>(t, `/repos/${a.repo}/issues/${a.number}`);
      const body = `${issue.body ?? ""}\n\n### Clarification (answer to the agent)\n\n${a.text.trim()}`;
      await gh(t, `/repos/${a.repo}/issues/${a.number}`, { method: "PATCH", body: JSON.stringify({ body }) });
      await gh(t, `/repos/${a.repo}/issues/${a.number}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: `Answer: ${a.text.trim()}\n\n_Added to the issue description from Agent HQ; the agent has been restarted._` }),
      });
      await removeLabel(t, a.repo, a.number, "needs-human");
      await launch(t, a.repo, a.number);
      return { ok: true, message: "Answer sent, the agent is back at work." };
    }
    case "claude":
      await gh(t, `/repos/${a.repo}/issues/${a.number}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: `@claude ${a.text.trim()}` }),
      });
      return { ok: true, message: "Request sent to @claude." };
    case "merge": {
      const pr = await gh<{ labels: { name: string }[]; head: { ref: string }; title: string }>(t, `/repos/${a.repo}/pulls/${a.prNumber}`);
      if (!pr.labels.some((l) => l.name === "review:ok")) return { ok: false, message: "The reviewers have not given review:ok yet." };
      if (!pr.head.ref.startsWith("agent/")) return { ok: false, message: "Agent HQ only merges agent PRs." };
      await gh(t, `/repos/${a.repo}/pulls/${a.prNumber}/merge`, {
        method: "PUT",
        body: JSON.stringify({ merge_method: "squash", commit_title: `${pr.title} (#${a.prNumber})` }),
      });
      return { ok: true, message: `PR #${a.prNumber} merged. Quest complete!` };
    }
    case "onboard":
      await gh(t, `/repos/${config.org}/${config.platformRepo}/actions/workflows/onboard-repo.yml/dispatches`, {
        method: "POST",
        body: JSON.stringify({ ref: "main", inputs: { repo: a.repo, agent: "true" } }),
      });
      return { ok: true, message: `Onboarding of ${a.repo} started. A setup PR is on its way.` };
  }
}

export function runDemoAction(a: Action): ActionResult {
  switch (a.type) {
    case "create": {
      const n = demoCreateQuest(a.repo, a.title.trim(), a.scope || "general");
      if (a.launch) demoLaunch(a.repo, n);
      return { ok: true, message: `Quest #${n} created (demo).` };
    }
    case "launch":
      return demoLaunch(a.repo, a.number)
        ? { ok: true, message: `An agent is on its way to #${a.number} (demo).` }
        : { ok: false, message: "In the demo, only quests you created can be launched." };
    case "merge":
      return demoMerge(a.repo, a.prNumber)
        ? { ok: true, message: "PR merged (demo). Quest complete!" }
        : { ok: false, message: "In the demo, simulated quests merge on their own." };
    default:
      return { ok: true, message: "Simulated action: nothing is sent to GitHub in the demo." };
  }
}
