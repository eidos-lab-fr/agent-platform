# Agent HQ

The gamified web headquarters for agent-platform: create tasks, hand them to agents, answer when they get stuck and merge, all without the GitHub UI. The "Workshop" shows the agents working live.

GitHub stays the source of truth. Agent HQ reads the issues, pull requests and GitHub Actions runs of connected repos, derives the state of each quest and each agent, and acts **with your own GitHub token**. That matters: agent-platform workflows only start when the sender is listed in `allowed_users`.

## Tabs

| Tab | Content |
| --- | --- |
| HQ | Agents at work, raised hands (`needs-human`) you can answer in place, PRs ready to merge, achievements, activity feed |
| Workshop | One room per repo: dev desks per scope, review tower (spec, security, tests), `@claude` corner, PR mailbox, your merge door. Day and night follow Paris time |
| Quests | The board as a path (Backlog → … → Done, Blocked on the side) and the quest forge with its clarity meter |
| Archipelago | Connected repos, one card per dev agent (quests completed, first-try rate, issue → PR time), and onboarding for a new repo |

Clicking a quest opens its panel: launch an agent, answer its question, ask `@claude` for a fix, merge.

## What the buttons do on GitHub

| Action | GitHub calls |
| --- | --- |
| Create a quest | Issue in the format of the "Fonctionnalité" issue form, `scope:<x>` label |
| Hand to an agent | Adds `scope:<x>`, removes then re-adds `ready-for-dev` |
| Answer a raised hand | Appends the answer to the issue body (the agent rereads the issue with `gh issue view`, which does not show comments), posts it as a comment, removes `needs-human`, restarts the agent |
| Ask `@claude` | `@claude …` comment on the open PR, otherwise on the issue |
| Merge | Squash merge, only for an `agent/*` branch that has `review:ok`. You always click |
| Explore an island | Runs agent-platform's `onboard-repo.yml` workflow |

The agent rules, issue form and board columns of agent-platform are in French. Agent HQ's interface is in English, but issues it creates keep the French headings of the issue form so the agents read them as usual.

## How state is derived

`lib/derive.ts` turns REST API responses into quests and agents:

- **Column**: closed or PR merged → Done; `needs-human` → Blocked; open PR with `review:ok` → Human review; open PR → PR open; "Agent dev" run in progress → In development; `ready-for-dev` → Ready for dev; otherwise Backlog.
- **PR → issue link**: branch `agent/<n>-<slug>`, otherwise `Closes #n`. **Run → issue link**: branch, otherwise the issue title (`display_title`).
- **Dev agent activity**: the running step of the job. `anthropics/claude-code-action` → "at work", other steps → "getting ready".
- **Reviewers**: the `review (spec|securite|tests)` jobs of the "Agents de review" run.

GitHub only serves a job's logs once it has finished, so the Workshop shows the real step, not every file touched.

The "Spec in progress" and "Spec ready" columns only appear when issues carry the `spec:en-cours` or `spec:prete` labels. Agent HQ reads labels, not the GitHub Project board.

## XP and achievements

100 XP per completed quest, +50 if the PR was merged with `review:ok`, +10 per quest created. Launching agents earns nothing, because every launch costs Anthropic credits. Achievements are computed in `lib/progress.ts` over the last 60 days.

## Run it locally

```bash
cd hq
npm ci
npm run dev
```

Without configuration, the app runs in **demo mode**: a simulated world where quests go through the whole journey in about 4 minutes, with the occasional raised hand. Nothing is sent to GitHub.

To connect it to your real repos:

1. Create a GitHub OAuth App (Settings → Developer settings → OAuth Apps) with `<APP_URL>/api/auth/callback` as the callback URL.
2. Copy `.env.example` to `.env.local` and fill in `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET` (32 characters or more) and `APP_URL`.
3. `ALLOWED_LOGINS` must match `allowed_users` in the workflows.

The requested token has the `repo` and `workflow` scopes (the latter to start onboarding). It stays encrypted in an `httpOnly` cookie and is never sent to the browser. The Anthropic key stays in GitHub secrets: Agent HQ does not need it.

The repos followed are those of `GITHUB_ORG` that contain `.github/workflows/agent-dev.yml`, or the fixed list in `HQ_REPOS`.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

## Hosting

Any Node host works (Vercel, Fly.io, Render). The live stream uses Server-Sent Events and polls GitHub every 10 seconds per signed-in viewer, with an 8-second cache.

## Agent Arcade

The Workshop view lives in `components/arcade/` and depends only on React, so it can later be published on its own. See [components/arcade/README.md](components/arcade/README.md).

## Next steps

From the plan: GitHub webhooks and an event log in a database (instead of polling), cost per quest read from `claude-code-action`'s execution file, fine-grained telemetry through Claude Code hooks in the workflows, a public read-only showcase on eidoslab.fr.
