// Turns a request written in plain words ("users should be able to export a note as PDF")
// into a quest the agents can work from: title, desk, acceptance criteria, out of scope.
//
// The model comes from the AI settings (lib/ai.ts): Claude Code, an API key, Ollama, or rules.
// In auto, a failing provider falls back to the rules so you always get a draft.

import { aiSettings, completeJson, pickProvider, type ProviderId } from "./ai";

export interface SpecDraft {
  title: string;
  scope: string;
  /** The need, rewritten in two to four sentences. */
  summary: string;
  perimetre: string;
  criteres: string[];
  horsPerimetre: string;
  verification: string;
  /** What remains unclear: better asked now than by an agent stuck halfway. */
  questions: string[];
  engine: ProviderId;
}

export interface SpecRequest {
  prompt: string;
  scopes: string[];
  /** Island (repo) name, for context only. */
  repo: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    scope: { type: "string" },
    summary: { type: "string" },
    perimetre: { type: "string" },
    criteres: { type: "array", items: { type: "string" } },
    horsPerimetre: { type: "string" },
    verification: { type: "string" },
    questions: { type: "array", items: { type: "string" } },
  },
  required: ["title", "scope", "summary", "perimetre", "criteres", "horsPerimetre", "verification", "questions"],
  additionalProperties: false,
} as const;

export function systemPrompt(scopes: string[]): string {
  return [
    "You turn a product request written by a product manager into a development ticket for coding agents.",
    "The product manager is not technical: keep their intent, do not invent features they did not ask for, and do not add technical detail they did not give.",
    "Write in the language of the request.",
    "",
    "Fields:",
    "- title: imperative, under 70 characters, says the user-visible outcome.",
    `- scope: the agent desk best suited to the work, one of: ${[...scopes, "general"].join(", ")}. Use general when unsure.`,
    "- summary: two to four sentences: who needs what, and why.",
    "- perimetre: one or two sentences on what this ticket covers.",
    "- criteres: two to six acceptance criteria, each observable and checkable by a test, written from the user's point of view.",
    "- horsPerimetre: what this ticket deliberately leaves out, so the agent does not overreach. Infer the obvious neighbours of the request.",
    "- verification: what a person checks by hand before merging, in one or two steps.",
    "- questions: zero to three questions whose answer would change the work. Leave empty when the request is clear. Never ask about implementation details the agent can decide.",
  ].join("\n");
}

function clean(raw: Partial<SpecDraft>, req: SpecRequest, engine: SpecDraft["engine"]): SpecDraft {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
  const scope = str(raw.scope);
  return {
    title: str(raw.title).slice(0, 120) || req.prompt.slice(0, 70),
    scope: [...req.scopes, "general"].includes(scope) ? scope : guessScope(req.prompt, req.scopes),
    summary: str(raw.summary),
    perimetre: str(raw.perimetre),
    criteres: arr(raw.criteres).slice(0, 8),
    horsPerimetre: str(raw.horsPerimetre),
    verification: str(raw.verification),
    questions: arr(raw.questions).slice(0, 3),
    engine,
  };
}

// ---------------------------------------------------------------- Rules (no AI)

const SCOPE_HINTS: Record<string, string[]> = {
  front: ["page", "button", "screen", "display", "ui", "design", "form", "menu", "mobile", "écran", "bouton", "affich"],
  api: ["api", "endpoint", "database", "server", "export", "import", "sync", "webhook", "data", "base de données"],
  site: ["page", "seo", "blog", "article", "contact", "home", "accueil"],
};

export function guessScope(prompt: string, scopes: string[]): string {
  const p = prompt.toLowerCase();
  let best = "general";
  let score = 0;
  for (const s of scopes) {
    const hints = [s, ...(SCOPE_HINTS[s] ?? [])];
    const n = hints.filter((h) => p.includes(h)).length;
    if (n > score) {
      best = s;
      score = n;
    }
  }
  return best;
}

/** Without AI: splits the request into sentences and keeps the obvious structure. */
export function viaRules(req: SpecRequest): SpecDraft {
  const text = req.prompt.trim().replace(/\s+/g, " ");
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const first = (sentences[0] ?? text).replace(/[.!?]+$/, "");
  const title = first.length > 70 ? `${first.slice(0, 67).trimEnd()}…` : first;
  const criteres = sentences.length > 1 ? sentences.slice(1, 6).map((s) => s.replace(/[.!?]+$/, "")) : [`${first}`];
  const questions: string[] = [];
  if (sentences.length < 2) questions.push("What should the user see once it works?");
  if (!/\b(not|no|except|sans|pas)\b/i.test(text)) questions.push("Is there anything this should explicitly not do?");
  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    scope: guessScope(text, req.scopes),
    summary: text,
    perimetre: first,
    criteres,
    horsPerimetre: "",
    verification: "Try it in the preview as a user would.",
    questions,
    engine: "rules",
  };
}

export async function draftSpec(req: SpecRequest, opts: { hosted?: boolean } = {}): Promise<SpecDraft> {
  const settings = await aiSettings();
  const provider = await pickProvider(settings, { hosted: Boolean(opts.hosted) });
  if (provider === "rules") return viaRules(req);
  const ask = { system: systemPrompt(req.scopes), user: `Project: ${req.repo}\n\nRequest:\n${req.prompt}`, schema: SCHEMA };
  try {
    return clean((await completeJson(provider, settings, ask)) as Partial<SpecDraft>, req, provider);
  } catch (e) {
    if (settings.provider !== "auto") throw e;
    return viaRules(req);
  }
}
