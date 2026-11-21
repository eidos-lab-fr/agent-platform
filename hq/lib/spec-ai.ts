// Turns a request written in plain words ("users should be able to export a note as PDF")
// into a quest the agents can work from: title, desk, acceptance criteria, out of scope.
//
// Engines, in order (SPEC_ENGINE=auto): a local model through Ollama, then Claude if
// ANTHROPIC_API_KEY is set, then simple rules. SPEC_ENGINE=ollama|claude|rules forces one.

import Anthropic from "@anthropic-ai/sdk";

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
  engine: "ollama" | "claude" | "rules";
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

// ---------------------------------------------------------------- Ollama (local)

const ollamaUrl = () => (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
const ollamaModel = () => process.env.OLLAMA_MODEL ?? "llama3.1";

async function viaOllama(req: SpecRequest): Promise<SpecDraft> {
  const res = await fetch(`${ollamaUrl()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: ollamaModel(),
      stream: false,
      format: SCHEMA,
      options: { temperature: 0.2 },
      messages: [
        { role: "system", content: systemPrompt(req.scopes) },
        { role: "user", content: `Island: ${req.repo}\n\nRequest:\n${req.prompt}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama answered ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return clean(JSON.parse(data.message?.content ?? "{}"), req, "ollama");
}

async function ollamaUp(): Promise<boolean> {
  try {
    const res = await fetch(`${ollamaUrl()}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- Claude

async function viaClaude(req: SpecRequest): Promise<SpecDraft> {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
    max_tokens: 16000,
    // A short rewrite: low effort is enough and keeps the answer quick.
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    // If the model declines, the API retries on a suited model in the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: systemPrompt(req.scopes),
    messages: [{ role: "user", content: `Island: ${req.repo}\n\nRequest:\n${req.prompt}` }],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined this request.");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Claude returned no text.");
  return clean(JSON.parse(text.text), req, "claude");
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

export function engineChoice(): "auto" | SpecDraft["engine"] {
  const e = (process.env.SPEC_ENGINE ?? "auto").toLowerCase();
  return e === "ollama" || e === "claude" || e === "rules" ? e : "auto";
}

export async function draftSpec(req: SpecRequest): Promise<SpecDraft> {
  const choice = engineChoice();
  if (choice === "ollama") return viaOllama(req);
  if (choice === "claude") return viaClaude(req);
  if (choice === "rules") return viaRules(req);
  if (await ollamaUp()) {
    try {
      return await viaOllama(req);
    } catch {
      // fall through to the next engine
    }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await viaClaude(req);
    } catch {
      // fall through to the rules
    }
  }
  return viaRules(req);
}
