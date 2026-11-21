#!/usr/bin/env node
// Agent HQ setup and health check.
//
//   npm run setup    checks everything, installs dependencies, writes .env.local if needed
//   npm run doctor   the same checks, without changing anything
//
// No dependency: runs before `npm ci`.

import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const write = !process.argv.includes("--check");
const PORT = 4317;
const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => console.log(`  ! ${m}`);
const bad = (m) => {
  console.log(`  ✗ ${m}`);
  problems++;
};
let problems = 0;

function readEnv(file) {
  if (!existsSync(file)) return {};
  const env = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const envFile = join(root, ".env.local");
const env = { ...readEnv(envFile), ...process.env };
const org = env.GITHUB_ORG || "eidos-lab-fr";
const platform = env.PLATFORM_REPO || "agent-platform";

console.log(`\nAgent HQ ${write ? "setup" : "check"}\n`);

// 1. Node
const major = Number(process.versions.node.split(".")[0]);
if (major >= 20) ok(`Node ${process.versions.node}`);
else bad(`Node ${process.versions.node}: Agent HQ needs Node 20 or later (https://nodejs.org).`);

// 2. Dependencies
if (existsSync(join(root, "node_modules", "next"))) ok("Dependencies installed");
else if (write) {
  console.log("  … installing dependencies (npm ci)");
  const r = spawnSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status === 0) ok("Dependencies installed");
  else bad("npm ci failed: see the output above.");
} else bad("Dependencies missing: run `npm run setup`.");

// 3. How Agent HQ signs in
const oauth = Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
let token = env.GITHUB_TOKEN?.trim() || "";
if (env.HQ_AUTH === "demo") warn("HQ_AUTH=demo: the app shows a simulated world.");
else if (oauth || env.HQ_AUTH === "oauth") {
  ok("Hosted mode: GitHub OAuth App configured");
  warn("On your own machine you do not need the OAuth App: remove the GITHUB_CLIENT_* lines from .env.local to sign in with the GitHub CLI.");
  if (!env.ALLOWED_LOGINS) bad("ALLOWED_LOGINS is empty: nobody can sign in. Set it to your GitHub login.");
  if (!env.SESSION_SECRET) {
    if (write) {
      const secret = randomBytes(32).toString("hex");
      const text = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
      writeFileSync(envFile, /^SESSION_SECRET=.*$/m.test(text) ? text.replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${secret}`) : `${text.trimEnd()}\nSESSION_SECRET=${secret}\n`);
      ok("SESSION_SECRET generated in .env.local");
    } else warn("SESSION_SECRET is empty: you will be signed out at each restart. `npm run setup` generates one.");
  }
} else {
  if (!token) {
    try {
      token = execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      token = "";
    }
  }
  if (token) ok(env.GITHUB_TOKEN ? "Local mode: token from GITHUB_TOKEN" : "Local mode: token from the GitHub CLI (gh)");
  else {
    let hasGh = true;
    try {
      execFileSync("gh", ["--version"], { stdio: "ignore" });
    } catch {
      hasGh = false;
    }
    bad(
      hasGh
        ? "The GitHub CLI is not signed in: run `gh auth login -s repo,workflow`."
        : "The GitHub CLI is not installed: install it from https://cli.github.com, then run `gh auth login -s repo,workflow`. Until then, the app runs the demo.",
    );
  }
}

// 4. What the token can do
async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "agent-hq-setup" },
  });
  return { res, body: res.ok ? await res.json() : null };
}

if (token && !oauth) {
  try {
    const { res, body } = await api("/user");
    if (!res.ok) bad(`GitHub refused the token (${res.status}): run \`gh auth login -s repo,workflow\`.`);
    else {
      ok(`Signed in as ${body.login}`);
      const header = res.headers.get("x-oauth-scopes");
      const scopes = (header ?? "").split(",").map((s) => s.trim());
      if (header !== null) {
        const missing = ["repo", "workflow"].filter((s) => !scopes.includes(s));
        if (missing.length) bad(`The token lacks the ${missing.join(" and ")} scope: run \`gh auth refresh -s repo,workflow\`.`);
        else ok("Scopes repo and workflow");
      }
      warn(`Agents only start for allowed users: check that ${body.login} is in the AGENT_ALLOWED_USERS variable of ${org} (or the workflows' allowed_users).`);

      const platformRes = await api(`/repos/${org}/${platform}`);
      if (!platformRes.res.ok) bad(`No access to ${org}/${platform} (${platformRes.res.status}): check GITHUB_ORG and PLATFORM_REPO.`);
      else if (!platformRes.body.permissions?.push) warn(`You cannot push to ${org}/${platform}: saving agent teams will fail.`);
      else ok(`Access to ${org}/${platform}`);

      if (env.HQ_REPOS) ok(`Repos followed (HQ_REPOS): ${env.HQ_REPOS}`);
      else {
        const repos = await api(`/orgs/${org}/repos?per_page=100&sort=pushed`);
        if (!repos.res.ok) bad(`Cannot list the repos of ${org} (${repos.res.status}).`);
        else {
          const candidates = repos.body.filter((r) => !r.archived && r.name !== platform);
          const connected = [];
          for (const r of candidates) {
            const f = await api(`/repos/${r.full_name}/contents/.github/workflows/agent-dev.yml`);
            if (f.res.ok) connected.push(r.name);
          }
          if (connected.length) ok(`Connected repos: ${connected.join(", ")}`);
          else warn(`No repo of ${org} is connected yet: connect one from Settings (or Archipelago) in the app.`);
        }
      }
    }
  } catch (e) {
    bad(`GitHub could not be reached: ${e.message}`);
  }
}

// 5. AI for the specs (also set from the page AI settings)
const ollama = (env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const ollamaUp = await fetch(`${ollama}/api/tags`, { signal: AbortSignal.timeout(1500) })
  .then((r) => r.ok)
  .catch(() => false);
const claudeCode = spawnSync("claude", ["--version"], { encoding: "utf8", timeout: 5000 }).status === 0;
const keys = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DEEPSEEK_API_KEY"].filter((k) => env[k]);
if (ollamaUp) ok(`AI for specs: your local model (Ollama at ${ollama})`);
if (claudeCode) ok("AI for specs: Claude Code is installed, your Claude subscription can be used");
if (keys.length) ok(`AI for specs: ${keys.join(", ")} set`);
if (!ollamaUp && !claudeCode && !keys.length)
  warn("No AI found for specs: they are structured by simple rules. Optional: install Claude Code, or set a key in the page AI settings.");

// 6. Port
const free = await new Promise((resolve) => {
  const srv = createServer()
    .once("error", () => resolve(false))
    .once("listening", () => srv.close(() => resolve(true)))
    .listen(PORT, "127.0.0.1");
});
if (free) ok(`Port ${PORT} is free`);
else warn(`Port ${PORT} is taken (Agent HQ already running?). Use another one with \`npm run dev -- -p 4318\`.`);

// 7. .env.local
if (!existsSync(envFile) && write) {
  writeFileSync(
    envFile,
    `# Agent HQ: everything is optional. See .env.example for the other settings.\nGITHUB_ORG=${org}\n`,
  );
  ok("Created .env.local");
}

console.log(problems ? `\n${problems} thing(s) to fix above. The app still starts, in demo mode if it has no token.\n` : "\nAll good.\n");
console.log(`Start Agent HQ:  npm run dev   →  http://127.0.0.1:${PORT}\n`);
process.exitCode = problems && !write ? 1 : 0;
