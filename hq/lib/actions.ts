// Actions de l'utilisateur, exécutées sur GitHub avec son propre jeton.

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

/** Corps de ticket au format du formulaire « Fonctionnalité » d'agent-platform. */
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
    "_Créé depuis Agent HQ._",
  ].join("\n\n");
}

export function validate(a: Action): string | null {
  if (!a || typeof a !== "object" || !("type" in a)) return "Action invalide.";
  if (!REPO_RE.test(a.repo ?? "") && a.type !== "onboard") return "Repo invalide.";
  if (a.type === "onboard" && !/^[\w.-]+$/.test(a.repo)) return "Nom de repo invalide (sans l'org).";
  if (a.type === "create") {
    if (!a.title?.trim()) return "La quête a besoin d'un titre.";
    if (!a.spec?.trim()) return "Le chemin de la spec est obligatoire.";
    if (!a.criteres?.trim()) return "Ajoute au moins un critère d'acceptation.";
    if (!/^[\w-]+$/.test(a.scope ?? "")) return "Scope invalide.";
  }
  if ((a.type === "answer" || a.type === "claude") && !a.text?.trim()) return "Le message est vide.";
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

/** Pose ready-for-dev (en le retirant d'abord s'il est déjà là) : c'est ce qui réveille l'agent dev. */
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
      return { ok: true, message: a.launch ? `Quête #${issue.number} créée et confiée à un agent.` : `Quête #${issue.number} créée.`, url: issue.html_url };
    }
    case "launch":
      await launch(t, a.repo, a.number, a.scope);
      return { ok: true, message: `Un agent part sur #${a.number}.` };
    case "answer": {
      // L'agent relit le ticket avec gh issue view, qui n'affiche pas les commentaires :
      // la réponse est donc ajoutée au corps du ticket, et aussi postée en commentaire.
      const issue = await gh<{ body: string | null }>(t, `/repos/${a.repo}/issues/${a.number}`);
      const body = `${issue.body ?? ""}\n\n### Précision (réponse à l'agent)\n\n${a.text.trim()}`;
      await gh(t, `/repos/${a.repo}/issues/${a.number}`, { method: "PATCH", body: JSON.stringify({ body }) });
      await gh(t, `/repos/${a.repo}/issues/${a.number}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: `Réponse : ${a.text.trim()}\n\n_Ajoutée à la description du ticket depuis Agent HQ, agent relancé._` }),
      });
      await removeLabel(t, a.repo, a.number, "needs-human");
      await launch(t, a.repo, a.number);
      return { ok: true, message: "Réponse envoyée, l'agent repart." };
    }
    case "claude":
      await gh(t, `/repos/${a.repo}/issues/${a.number}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: `@claude ${a.text.trim()}` }),
      });
      return { ok: true, message: "Demande envoyée à @claude." };
    case "merge": {
      const pr = await gh<{ labels: { name: string }[]; head: { ref: string }; title: string }>(t, `/repos/${a.repo}/pulls/${a.prNumber}`);
      if (!pr.labels.some((l) => l.name === "review:ok")) return { ok: false, message: "Les relecteurs n'ont pas encore donné review:ok." };
      if (!pr.head.ref.startsWith("agent/")) return { ok: false, message: "Agent HQ ne merge que les PR d'agents." };
      await gh(t, `/repos/${a.repo}/pulls/${a.prNumber}/merge`, {
        method: "PUT",
        body: JSON.stringify({ merge_method: "squash", commit_title: `${pr.title} (#${a.prNumber})` }),
      });
      return { ok: true, message: `PR #${a.prNumber} mergée. Quête livrée !` };
    }
    case "onboard":
      await gh(t, `/repos/${config.org}/${config.platformRepo}/actions/workflows/onboard-repo.yml/dispatches`, {
        method: "POST",
        body: JSON.stringify({ ref: "main", inputs: { repo: a.repo, agent: "true" } }),
      });
      return { ok: true, message: `Onboarding de ${a.repo} lancé. Une PR de configuration arrive.` };
  }
}

export function runDemoAction(a: Action): ActionResult {
  switch (a.type) {
    case "create": {
      const n = demoCreateQuest(a.repo, a.title.trim(), a.scope || "general");
      if (a.launch) demoLaunch(a.repo, n);
      return { ok: true, message: `Quête #${n} créée (démo).` };
    }
    case "launch":
      return demoLaunch(a.repo, a.number)
        ? { ok: true, message: `Un agent part sur #${a.number} (démo).` }
        : { ok: false, message: "En démo, seules tes propres quêtes peuvent être lancées." };
    case "merge":
      return demoMerge(a.repo, a.prNumber)
        ? { ok: true, message: "PR mergée (démo). Quête livrée !" }
        : { ok: false, message: "En démo, les quêtes simulées se mergent toutes seules." };
    default:
      return { ok: true, message: "Action simulée : en démo, rien n'est envoyé à GitHub." };
  }
}
