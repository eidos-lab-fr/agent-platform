import { mkdtemp, readFile, stat, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiSettings, completeJson, parseJson, pickProvider, providerStatus, resetCliCache, saveAiSettings } from "@/lib/ai";

const SCHEMA = { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false };
const ENV = ["AI_PROVIDER", "SPEC_ENGINE", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DEEPSEEK_API_KEY", "HQ_AI_FILE", "CLAUDE_BIN", "OLLAMA_URL"];
let saved: Record<string, string | undefined>;
let dir: string;

beforeEach(async () => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
  dir = await mkdtemp(join(tmpdir(), "hq-ai-"));
  process.env.HQ_AI_FILE = join(dir, ".hq", "ai.json");
  process.env.CLAUDE_BIN = join(dir, "no-claude");
  resetCliCache();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
});

describe("AI settings", () => {
  it("saves keys to a file only you can read, and hides them in the status", async () => {
    await saveAiSettings({ provider: "deepseek", keys: { deepseek: " sk-deep-1234 " }, models: { deepseek: "deepseek-reasoner" } });
    expect((await stat(process.env.HQ_AI_FILE!)).mode & 0o777).toBe(0o600);
    const s = await aiSettings();
    expect(s.provider).toBe("deepseek");
    expect(s.keys.deepseek).toBe("sk-deep-1234");
    const status = await providerStatus(s, { hosted: false });
    const d = status.find((p) => p.id === "deepseek")!;
    expect(d).toMatchObject({ ready: true, keyHint: "…1234", model: "deepseek-reasoner" });
    expect(JSON.stringify(status)).not.toContain("sk-deep");
    await saveAiSettings({ keys: { deepseek: "" } });
    expect(JSON.parse(await readFile(process.env.HQ_AI_FILE!, "utf8")).keys).toEqual({});
  });

  it("falls back to the environment, and reads the old SPEC_ENGINE=claude", async () => {
    process.env.SPEC_ENGINE = "claude";
    process.env.OPENAI_API_KEY = "sk-env";
    const s = await aiSettings();
    expect(s.provider).toBe("anthropic");
    expect(s.keys.openai).toBe("sk-env");
  });

  it("refuses odd model names and addresses", async () => {
    await expect(saveAiSettings({ models: { openai: "gpt; rm -rf" } })).rejects.toThrow(/odd/);
    await expect(saveAiSettings({ ollamaUrl: "file:///etc" })).rejects.toThrow(/http/);
  });

  it("in auto, picks the first ready provider and ends on the rules", async () => {
    expect(await pickProvider(await aiSettings(), { hosted: false })).toBe("rules");
    process.env.OPENAI_API_KEY = "sk-x";
    expect(await pickProvider(await aiSettings(), { hosted: false })).toBe("openai");
  });
});

describe("providers", () => {
  it("OpenAI gets a strict JSON schema, DeepSeek a JSON object with the schema in the prompt", async () => {
    const bodies: { url: string; body: Record<string, unknown>; auth: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        bodies.push({ url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).Authorization });
        return new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"answer":"ok"}\n```' } }] }));
      }),
    );
    process.env.OPENAI_API_KEY = "sk-o";
    process.env.DEEPSEEK_API_KEY = "sk-d";
    const s = await aiSettings();
    expect(await completeJson("openai", s, { system: "sys", user: "hi", schema: SCHEMA })).toEqual({ answer: "ok" });
    expect(await completeJson("deepseek", s, { system: "sys", user: "hi", schema: SCHEMA })).toEqual({ answer: "ok" });
    expect(bodies[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect(bodies[0].auth).toBe("Bearer sk-o");
    expect((bodies[0].body.response_format as { type: string }).type).toBe("json_schema");
    expect(bodies[1].url).toBe("https://api.deepseek.com/chat/completions");
    expect(bodies[1].body.response_format).toEqual({ type: "json_object" });
    expect(JSON.stringify(bodies[1].body.messages)).toContain("JSON schema");
  });

  it("Claude Code runs the claude command without tools and without the API key", async () => {
    const fake = join(dir, "claude");
    const log = join(dir, "log.json");
    await writeFile(
      fake,
      `#!/usr/bin/env node
const fs = require("fs");
if (process.argv[2] === "--version") { console.log("9.9.9 (Claude Code)"); process.exit(0); }
const input = fs.readFileSync(0, "utf8");
fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify({ args: process.argv.slice(2), input, key: process.env.ANTHROPIC_API_KEY ?? null }));
console.log(JSON.stringify({ is_error: false, result: "", structured_output: { answer: "ok" } }));
`,
    );
    await chmod(fake, 0o755);
    process.env.CLAUDE_BIN = fake;
    process.env.ANTHROPIC_API_KEY = "sk-should-not-leak";
    const s = await aiSettings();
    const status = await providerStatus(s, { hosted: false });
    expect(status.find((p) => p.id === "claude-code")).toMatchObject({ ready: true });
    expect((await providerStatus(s, { hosted: true })).find((p) => p.id === "claude-code")!.ready).toBe(false);
    expect(await completeJson("claude-code", s, { system: "sys", user: "the request", schema: SCHEMA })).toEqual({ answer: "ok" });
    const seen = JSON.parse(await readFile(log, "utf8"));
    expect(seen.key).toBeNull();
    expect(seen.input).toBe("the request");
    expect(seen.args).toEqual(expect.arrayContaining(["-p", "--output-format", "json", "--tools", "", "--json-schema", "--system-prompt", "sys"]));
  });

  it("parseJson takes the object out of a wrapped answer", () => {
    expect(parseJson('Sure: {"a":1} done')).toEqual({ a: 1 });
    expect(() => parseJson("nope")).toThrow(/not JSON/);
  });
});
