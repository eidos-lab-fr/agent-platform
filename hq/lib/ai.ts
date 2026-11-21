// Where the AI capabilities of HQ (writing specs, later planning) get their model from.
//
// Providers:
//   claude-code  your Claude subscription, through the `claude` CLI installed on this computer
//   anthropic    an Anthropic API key
//   openai       an OpenAI API key
//   deepseek     a DeepSeek API key (OpenAI-compatible API)
//   ollama       a local model
//   rules        no AI: simple rules
//
// Settings come from .hq/ai.json (written by the Settings page, local and demo modes only,
// file mode 600, never sent back to the browser) and fall back to the environment:
// AI_PROVIDER (or the older SPEC_ENGINE), ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY,
// OLLAMA_URL, and <PROVIDER>_MODEL.

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import Anthropic from "@anthropic-ai/sdk";

import { PROVIDERS, type ProviderId } from "./ai-names";

export { PROVIDERS, type ProviderId };
export type KeyProvider = "anthropic" | "openai" | "deepseek";
export const KEY_PROVIDERS: KeyProvider[] = ["anthropic", "openai", "deepseek"];

export const DEFAULT_MODELS: Record<Exclude<ProviderId, "rules">, string> = {
  "claude-code": "",
  anthropic: "claude-opus-5-5",
  openai: "gpt-5-mini",
  deepseek: "deepseek-chat",
  ollama: "llama3.1",
};

export interface AiSettings {
  /** "auto" picks the first provider that is ready, in the order of PROVIDERS, Ollama first. */
  provider: ProviderId | "auto";
  keys: Partial<Record<KeyProvider, string>>;
  models: Partial<Record<ProviderId, string>>;
  ollamaUrl?: string;
}

export interface JsonRequest {
  system: string;
  user: string;
  /** A JSON schema: every property required, no additional properties. */
  schema: Record<string, unknown>;
}

// ---------------------------------------------------------------- settings

const settingsFile = () => process.env.HQ_AI_FILE ?? join(process.cwd(), ".hq", "ai.json");

async function fileSettings(): Promise<Partial<AiSettings>> {
  try {
    return JSON.parse(await readFile(settingsFile(), "utf8")) as Partial<AiSettings>;
  } catch {
    return {};
  }
}

const isProvider = (v: unknown): v is ProviderId => typeof v === "string" && (PROVIDERS as readonly string[]).includes(v);

function envProvider(): AiSettings["provider"] {
  const v = (process.env.AI_PROVIDER ?? process.env.SPEC_ENGINE ?? "auto").toLowerCase();
  if (v === "claude") return "anthropic";
  return isProvider(v) ? v : "auto";
}

/** The settings in force: the saved file wins, the environment fills the gaps. */
export async function aiSettings(): Promise<AiSettings> {
  const f = await fileSettings();
  const env = process.env;
  return {
    provider: f.provider && (f.provider === "auto" || isProvider(f.provider)) ? f.provider : envProvider(),
    keys: {
      anthropic: f.keys?.anthropic || env.ANTHROPIC_API_KEY || undefined,
      openai: f.keys?.openai || env.OPENAI_API_KEY || undefined,
      deepseek: f.keys?.deepseek || env.DEEPSEEK_API_KEY || undefined,
    },
    models: {
      "claude-code": f.models?.["claude-code"] || env.CLAUDE_CODE_MODEL || "",
      anthropic: f.models?.anthropic || env.ANTHROPIC_MODEL || DEFAULT_MODELS.anthropic,
      openai: f.models?.openai || env.OPENAI_MODEL || DEFAULT_MODELS.openai,
      deepseek: f.models?.deepseek || env.DEEPSEEK_MODEL || DEFAULT_MODELS.deepseek,
      ollama: f.models?.ollama || env.OLLAMA_MODEL || DEFAULT_MODELS.ollama,
    },
    ollamaUrl: (f.ollamaUrl || env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, ""),
  };
}

export interface SettingsPatch {
  provider?: AiSettings["provider"];
  /** A key: "" removes the saved one, undefined keeps it. */
  keys?: Partial<Record<KeyProvider, string>>;
  models?: Partial<Record<ProviderId, string>>;
  ollamaUrl?: string;
}

/** Saves to .hq/ai.json, readable by you only. */
export async function saveAiSettings(patch: SettingsPatch): Promise<void> {
  const f = await fileSettings();
  const next: Partial<AiSettings> = { ...f, keys: { ...f.keys }, models: { ...f.models } };
  if (patch.provider !== undefined) {
    if (patch.provider !== "auto" && !isProvider(patch.provider)) throw Object.assign(new Error("Unknown provider."), { status: 400 });
    next.provider = patch.provider;
  }
  for (const k of KEY_PROVIDERS) {
    const v = patch.keys?.[k];
    if (v === undefined) continue;
    if (v.trim()) next.keys![k] = v.trim();
    else delete next.keys![k];
  }
  for (const p of PROVIDERS) {
    const v = patch.models?.[p];
    if (v === undefined) continue;
    if (!/^[\w.:/-]{0,80}$/.test(v.trim())) throw Object.assign(new Error("A model name has odd characters."), { status: 400 });
    if (v.trim()) next.models![p] = v.trim();
    else delete next.models![p];
  }
  if (patch.ollamaUrl !== undefined) {
    const u = patch.ollamaUrl.trim();
    if (u && !/^https?:\/\/[^\s]+$/.test(u)) throw Object.assign(new Error("The Ollama address must start with http:// or https://."), { status: 400 });
    if (u) next.ollamaUrl = u;
    else delete next.ollamaUrl;
  }
  await mkdir(dirname(settingsFile()), { recursive: true });
  await writeFile(settingsFile(), JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
}

// ---------------------------------------------------------------- status

export interface ProviderStatus {
  id: ProviderId;
  ready: boolean;
  /** What is set up, or what is missing, in plain words. */
  detail: string;
  model: string;
  /** The last four characters of the key, so you can tell which one is set. */
  keyHint?: string;
}

let cliCache: { at: number; ok: boolean; version: string } | null = null;

/** Is the `claude` CLI installed and signed in? Cached one minute. */
export async function claudeCli(): Promise<{ ok: boolean; version: string }> {
  if (cliCache && Date.now() - cliCache.at < 60_000) return cliCache;
  const version = await run(claudeBin(), ["--version"], "", 5_000).then(
    (out) => out.trim().split("\n")[0],
    () => "",
  );
  cliCache = { at: Date.now(), ok: Boolean(version), version };
  return cliCache;
}

export function resetCliCache() {
  cliCache = null;
}

async function ollamaUp(url: string): Promise<boolean> {
  try {
    return (await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

const hint = (key?: string) => (key ? `…${key.slice(-4)}` : undefined);

/** Hosted (OAuth) mode runs on a server: no CLI of yours there. */
export async function providerStatus(s: AiSettings, opts: { hosted: boolean }): Promise<ProviderStatus[]> {
  const [cli, ollama] = await Promise.all([opts.hosted ? Promise.resolve({ ok: false, version: "" }) : claudeCli(), ollamaUp(s.ollamaUrl!)]);
  return PROVIDERS.map((id): ProviderStatus => {
    const model = id === "rules" ? "" : s.models[id] || DEFAULT_MODELS[id];
    switch (id) {
      case "claude-code":
        return {
          id,
          model,
          ready: cli.ok,
          detail: opts.hosted ? "Only when HQ runs on your computer." : cli.ok ? `${cli.version}, uses your Claude subscription` : "The claude command is not installed here.",
        };
      case "ollama":
        return { id, model, ready: ollama, detail: ollama ? `Running at ${s.ollamaUrl}` : `Not running at ${s.ollamaUrl}` };
      case "rules":
        return { id, model, ready: true, detail: "Always there. Splits your words into criteria, no AI." };
      default:
        return { id, model, ready: Boolean(s.keys[id]), detail: s.keys[id] ? "API key set" : "No API key", keyHint: hint(s.keys[id]) };
    }
  });
}

/** The provider to use now: the chosen one, or the first ready one in auto. */
export async function pickProvider(s: AiSettings, opts: { hosted: boolean }): Promise<ProviderId> {
  if (s.provider !== "auto") return s.provider;
  const order: ProviderId[] = ["ollama", "claude-code", "anthropic", "openai", "deepseek", "rules"];
  const status = await providerStatus(s, opts);
  return order.find((id) => status.find((x) => x.id === id)?.ready) ?? "rules";
}

// ---------------------------------------------------------------- calls

export class AiError extends Error {
  status = 502;
}

/** Asks one provider for a JSON object matching the schema. */
export async function completeJson(provider: Exclude<ProviderId, "rules">, s: AiSettings, req: JsonRequest): Promise<unknown> {
  switch (provider) {
    case "claude-code":
      return viaClaudeCode(s, req);
    case "anthropic":
      return viaAnthropic(s, req);
    case "openai":
      return viaOpenAiCompatible("https://api.openai.com/v1", s.keys.openai, s.models.openai || DEFAULT_MODELS.openai, req, "strict");
    case "deepseek":
      return viaOpenAiCompatible("https://api.deepseek.com", s.keys.deepseek, s.models.deepseek || DEFAULT_MODELS.deepseek, req, "object");
    case "ollama":
      return viaOllama(s, req);
  }
}

const claudeBin = () => process.env.CLAUDE_BIN ?? "claude";

function run(cmd: string, args: string[], input: string, timeout: number, env?: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { timeout, maxBuffer: 4 * 1024 * 1024, env: env ?? process.env, cwd: tmpdir() }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr: String(stderr) }));
      else resolve(String(stdout));
    });
    child.stdin?.end(input);
  });
}

/**
 * Runs `claude -p` headless, with no tools, so the answer is billed to your subscription.
 * The API key is removed from its environment, so the CLI uses your signed-in account.
 */
async function viaClaudeCode(s: AiSettings, req: JsonRequest): Promise<unknown> {
  const args = ["-p", "--output-format", "json", "--tools", "", "--json-schema", JSON.stringify(req.schema), "--system-prompt", req.system];
  const model = s.models["claude-code"];
  if (model) args.push("--model", model);
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  let out: string;
  try {
    out = await run(claudeBin(), args, req.user, 120_000, env);
  } catch (e) {
    const msg = ((e as { stderr?: string }).stderr || (e as Error).message).trim().split("\n").slice(-1)[0];
    throw new AiError(`Claude Code failed: ${msg || "no answer"}. Run \`claude\` once in a terminal to sign in.`);
  }
  const r = JSON.parse(out) as { is_error?: boolean; result?: string; structured_output?: unknown };
  if (r.is_error) throw new AiError(`Claude Code: ${r.result ?? "error"}`);
  return r.structured_output ?? parseJson(r.result ?? "");
}

async function viaAnthropic(s: AiSettings, req: JsonRequest): Promise<unknown> {
  if (!s.keys.anthropic) throw new AiError("No Anthropic API key.");
  const client = new Anthropic({ apiKey: s.keys.anthropic });
  const response = await client.beta.messages.create({
    model: s.models.anthropic || DEFAULT_MODELS.anthropic,
    max_tokens: 16000,
    // A short rewrite: low effort is enough and keeps the answer quick.
    output_config: { effort: "low", format: { type: "json_schema", schema: req.schema } },
    // If the model declines, the API retries on a suited model in the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: req.system,
    messages: [{ role: "user", content: req.user }],
  });
  if (response.stop_reason === "refusal") throw new AiError("Claude declined this request.");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new AiError("Claude returned no text.");
  return JSON.parse(text.text);
}

/** OpenAI and DeepSeek share the chat completions API. DeepSeek only knows "json_object". */
async function viaOpenAiCompatible(base: string, key: string | undefined, model: string, req: JsonRequest, mode: "strict" | "object"): Promise<unknown> {
  if (!key) throw new AiError("No API key.");
  const response_format =
    mode === "strict" ? { type: "json_schema", json_schema: { name: "answer", strict: true, schema: req.schema } } : { type: "json_object" };
  const system = mode === "strict" ? req.system : `${req.system}\n\nAnswer with one JSON object matching this JSON schema:\n${JSON.stringify(req.schema)}`;
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model,
      response_format,
      messages: [
        { role: "system", content: system },
        { role: "user", content: req.user },
      ],
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  if (!res.ok) throw new AiError(`${base.includes("deepseek") ? "DeepSeek" : "OpenAI"} answered ${res.status}: ${data.error?.message ?? "error"}`);
  return parseJson(data.choices?.[0]?.message?.content ?? "");
}

async function viaOllama(s: AiSettings, req: JsonRequest): Promise<unknown> {
  const res = await fetch(`${s.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: s.models.ollama || DEFAULT_MODELS.ollama,
      stream: false,
      format: req.schema,
      options: { temperature: 0.2 },
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
    }),
  });
  if (!res.ok) throw new AiError(`Ollama answered ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return parseJson(data.message?.content ?? "");
}

/** Takes the JSON object out of an answer, even when wrapped in a code fence. */
export function parseJson(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) throw new AiError("The answer was not JSON.");
    return JSON.parse(m[0]);
  }
}
