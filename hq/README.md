# Agent HQ

The gamified web headquarters for agent-platform: create tasks, hand them to agents, answer when they get stuck and merge, all without the GitHub UI. The "Workshop" shows the agents working live.

GitHub stays the source of truth. Agent HQ reads the issues, pull requests and GitHub Actions runs of connected repos, derives the state of each quest and each agent, and acts **with your own GitHub token**. That matters: agent-platform workflows only start when the sender is listed in `allowed_users`.

## Run it

```bash
cd hq
npm run setup   # checks Node, the GitHub CLI, your access, Ollama; installs dependencies
npm run dev     # http://127.0.0.1:4317
```

On your machine there is nothing to configure: Agent HQ signs in with the token of the [GitHub CLI](https://cli.github.com) (`gh auth login -s repo,workflow`). No OAuth App, no secret, no `.env.local`. In that mode the server only answers on `127.0.0.1`.

Without a token, the app runs in **demo mode** and says why at the top of the page: a simulated world where quests go through the whole journey in about 4 minutes, with the occasional raised hand. Nothing is sent to GitHub. `HQ_AUTH=demo` forces it.

`npm run doctor` runs the same checks as `setup` without changing anything. Everything else is optional: see `.env.example`.

## Simple and Dev modes

The switch at the top right picks who the interface is for.

**Simple** (the default) is for a product manager. Three tabs, product words, no animations:

| Tab | Content |
| --- | --- |
| To do | What waits for you: agents asking a question (answer in place), changes ready to ship, what is being built. "Watch them work" opens the Workshop |
| Requests | The roadmap: **Live** (merged), **In progress** (one branch per request, with its milestones) and **Backlog**, plus "New request" |
| Settings | Connected products, onboarding a new one, and the agent team |

**Dev** shows every view and the GitHub side (branches, labels, PR numbers, diff sizes, run steps), with the game layer: XP, achievements, activity feed.

| Tab | Content |
| --- | --- |
| HQ | Agents at work, raised hands, PRs to merge, achievements, activity feed |
| Roadmap | Same as Requests |
| Workshop | One room per repo: dev desks per scope, review tower (spec, security, tests), `@claude` corner, PR mailbox, your merge door. Day and night follow Paris time |
| Quests | The board as a path (Backlog → … → Done, Blocked on the side) and the quest forge, including "By hand" with a spec path |
| Team | Agent teams with skills, guardrails, file perimeter, several desks per island, duplicates |
| Archipelago | Connected repos, one card per dev agent (quests completed, first-try rate, issue → PR time), onboarding |

Every word that differs between the two modes lives in `components/words.ts`.

Clicking a quest opens its panel: launch an agent, answer its question, review the proposed change (size, each reviewer's result), ask for changes in your own words, merge.

## Writing a request from a prompt

"New request" opens on **Describe it**: write the need in plain words, and an AI rewrites it as a request the agents can work from (title, desk, acceptance criteria, out of scope, manual check), with up to three questions whose answers would change the work. Everything stays editable before creating the issue. The rewrite runs, in order:

1. a **local model through Ollama** (`OLLAMA_URL`, `OLLAMA_MODEL`), if it answers;
2. **Claude**, if `ANTHROPIC_API_KEY` is set (`claude-opus-5-5` at low effort by default, `ANTHROPIC_MODEL` to change it);
3. simple rules, without AI.

`SPEC_ENGINE=ollama|claude|rules` forces one. A request written this way has no spec file: the issue says so under "Chemin de la spec" and carries the spec in its own "Spec" section, which the dev agent reads with `gh issue view`. "By hand" keeps the original form with a spec path.

## Agent teams

On the first visit, a wizard offers a ready-made team (Web app squad, Content site, Solo builder) or an empty one, then lets you tick the islands each agent works on. Simple mode stops there: pick a team, tick the products. Dev mode opens everything below.

Each agent has a role (dev, or one of the three reviewers spec, security, tests), a mission, the files it may change, rules of thumb, its own context on top of the team's, and two sets of files: **skills** (know-how to read before working) and **guardrails** (what it must never do; if a request asks for it, it stops and asks through `needs-human`). Files can be written in place or uploaded as `.md`.

A trained agent can be placed on several islands, and on several desks of one island: each placement is a copy of its files. "Duplicate" makes a variant to train differently.

**Put the team to work** opens one pull request per island, in a single commit:

| File | Content |
| --- | --- |
| `.github/agents/dev-<desk>.md` | One per dev placement, in the `agents/onboard.md` format (Périmètre, Points d'attention), plus Contexte, Skills and Garde-fous sections pointing to the files below |
| `.github/agents/review-<role>.md` | Repo rules that the reviewer adds to its own. Existing rules are kept: Agent HQ only rewrites its block between `agent-hq:team` markers |
| `.github/agents/team/<agent>/skills/*`, `…/guardrails/*` | The agent's files |

It also creates the `scope:<desk>` labels. Nothing changes until you merge that PR.

Teams are stored as `teams/<id>.json` on the `hq-data` branch of the agent-platform repo (`HQ_DATA_BRANCH`), one commit per save through the contents API: versioned and shared between your devices, but never committed to `main`, which every connected repo runs its workflows from. The branch is created from `main` on the first save, so teams saved there by an earlier version carry over. In demo mode teams live in server memory.

## What the buttons do on GitHub

| Action | GitHub calls |
| --- | --- |
| Create a quest | Issue in the format of the "Fonctionnalité" issue form, `scope:<x>` label |
| Hand to an agent | Adds `scope:<x>`, removes then re-adds `ready-for-dev` |
| Answer a raised hand | Posts the answer as a comment (the agent reads the issue with `gh issue view --comments`), removes `needs-human`, restarts the agent |
| Ask `@claude` | `@claude …` comment on the open PR, otherwise on the issue |
| Merge | Squash merge, only for an `agent/*` branch that has `review:ok`. You always click |
| Connect a product / explore an island | Runs agent-platform's `onboard-repo.yml` workflow |
| Ask for changes | `@claude Please make these changes before merge: …` comment on the PR |
| Save a team | Commits `teams/<id>.json` on the `hq-data` branch of agent-platform |
| Put the team to work | Branch `hq/team-<name>-<id>`, one commit with the agent files, `scope:<desk>` labels, pull request |

The agent rules and issue form of agent-platform are in French. Agent HQ's interface is in English, but issues it creates keep the French headings of the issue form so the agents read them as usual.

## How state is derived

`lib/derive.ts` turns REST API responses into quests and agents:

- **Column**: closed or PR merged → Done; `needs-human` → Blocked; open PR with `review:ok` → Human review; open PR → PR open; "Agent dev" run in progress → In development; `ready-for-dev` → Ready for dev; otherwise Backlog.
- **PR → issue link**: branch `agent/<n>-<slug>`, otherwise `Closes #n`. **Run → issue link**: branch, otherwise the issue title (`display_title`).
- **Dev agent activity**: the running step of the job. `anthropics/claude-code-action` → "at work", other steps → "getting ready".
- **Reviewers**: the `review (spec|securite|tests)` jobs of the "Agents de review" run.

GitHub only serves a job's logs once it has finished, so the Workshop shows the real step, not every file touched.

Agent HQ reads labels and pull requests only: there is no GitHub Project board to keep in sync.

## XP and achievements

100 XP per completed quest, +50 if the PR was merged with `review:ok`, +10 per quest created. Launching agents earns nothing, because every launch costs Anthropic credits. Achievements are computed in `lib/progress.ts` over the last 60 days.

## Signing in

| Mode | When | Token |
| --- | --- | --- |
| Local | Default, when no OAuth App is configured | `GITHUB_TOKEN`, else `gh auth token`. The server only answers on loopback addresses |
| OAuth | `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` set, to host Agent HQ for others | Each user's own, from a GitHub OAuth App, sealed in an `httpOnly` cookie |
| Demo | No token found, or `HQ_AUTH=demo` | None: simulated world |

Either way Agent HQ acts with your own token, and agents only start for the logins in the organisation variable `AGENT_ALLOWED_USERS` (or the workflows' `allowed_users` input). The agents' Anthropic key stays in GitHub secrets: Agent HQ only needs one if you want Claude to rewrite prompted requests and have no local model.

Hosting with OAuth: create a GitHub OAuth App with `<APP_URL>/api/auth/callback` as callback URL, then set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `ALLOWED_LOGINS` and, behind a proxy, `APP_URL`. Without `APP_URL`, the app uses the address the browser called, so a port change does not break the callback. `npm run setup` generates `SESSION_SECRET`; without it, sessions end when the server restarts. The token has the `repo` and `workflow` scopes (the latter to start onboarding).

The repos followed are those of `GITHUB_ORG` that contain `.github/workflows/agent-dev.yml`, or the fixed list in `HQ_REPOS`.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

The same three run in CI (`.github/workflows/hq-ci.yml`) on every pull request that touches `hq/`.

## Hosting

Any Node host works (Vercel, Fly.io, Render), in OAuth mode. `npm start` binds to 127.0.0.1: on a host that needs a public interface, run `npx next start -H 0.0.0.0`. Caches live in server memory, so run a single instance.

The live stream uses Server-Sent Events. It polls GitHub every 10 seconds while an agent is at work and every 30 seconds otherwise, with conditional requests (`ETag`): GitHub answers 304 when nothing changed, and a 304 does not count against the 5,000 requests per hour of the token. Desks (scopes) and the list of repos are read every 5 minutes.

## Agent Arcade

The Workshop view lives in `components/arcade/` and depends only on React, so it can later be published on its own. See [components/arcade/README.md](components/arcade/README.md).

## Next steps

From the plan: GitHub webhooks and an event log in a database (instead of polling), cost per quest read from `claude-code-action`'s execution file, fine-grained telemetry through Claude Code hooks in the workflows, a public read-only showcase on eidoslab.fr.
