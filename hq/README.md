# Agent HQ

One project board for your agents. You write an idea in your own words, the AI turns it into a spec, a planner splits it by code zone and checks what can run in parallel, and agents of the right color walk to the card and build it. You answer their questions on the card, then approve and ship.

Signed in (local mode with the GitHub CLI, or OAuth), the board is your repos on GitHub. Without a token, or with `HQ_AUTH=demo`, it is a demo that runs in your browser and sends nothing.

## Run it

```bash
cd hq
npm run setup   # checks Node, the GitHub CLI, your access, Ollama; installs dependencies
npm run dev     # http://127.0.0.1:4317
```

On your machine there is nothing to configure: Agent HQ signs in with the token of the [GitHub CLI](https://cli.github.com) (`gh auth login -s repo,workflow`). In that mode the server only answers on `127.0.0.1`. `npm run doctor` runs the checks without changing anything.

## The screens

- **My projects** (`/?home=1`): one card per repo with what is in progress, to approve, and the open questions; plus *All projects* and *+ Add a project*. HQ reopens the last project you looked at; the logo brings you back here.
- **The board** (`/<project>`): a project picker (⌘K), the team of agents of the project, a load gauge per agent color, and six columns:

| Column | What happens |
| --- | --- |
| Ideas | You write the need. Its zones are guessed from your words (you can correct them). |
| Specified | The AI wrote the spec (acceptance criteria, out of scope) and you approved it. |
| Planned | The planner listed the steps and files of each zone, and whether it can run in parallel. |
| Waiting | Launched, but blocked by a card on the same files, or by a full agent. Starts on its own when free. |
| In progress | The agents are on it: click one to see its plan, what is done, its questions, or to ask it something. |
| To approve | Approve and ship, or ask for a change (the card goes back through the queue). |

- **Teams** (`/teams`): ready-made teams (Web app, Content site, Solo) and your own. Each agent has one specialty, one color, its skills and its rules.
- **AI settings** (`/settings`): where the AI comes from (see below).

## On GitHub

| On the board | On GitHub |
| --- | --- |
| A project | A connected repo (it has `.github/workflows/agent-dev.yml`), or one listed in `HQ_REPOS`. *+ Add a project* starts the onboarding workflow, which opens a setup pull request |
| A card | An issue. Its body holds the need, then the spec and the plan as French sections the dev agent reads (`### Critères d'acceptation`…), plus a hidden `<!-- hq: … -->` line for HQ |
| Its column | Labels `hq:idea`, `hq:specified`, `hq:planned`, `hq:waiting`; then `ready-for-dev` or a running *Agent dev* run (In progress), `needs-human` (a question), an open agent pull request (To approve), merged or closed (Shipped, 14 days) |
| Its colors | Labels `zone:front`, `zone:back`, `zone:data`, `zone:docs` |
| An agent at work | The *Agent dev* run of the issue: one run per card, with the agent file of the card's main zone (`scope:<zone>` when the repo has `.github/agents/dev-<zone>.md`, else the generalist) |
| A question | The agent's comment with `needs-human`. *Answer* comments, removes the label and restarts the agent |
| Ask the agents | A comment on the issue: the agent reads the comments each time it starts |
| Ask for a change | `@claude <your words>` on the pull request |
| Approve and ship | Squash merge of the pull request, only with `review:ok` and an `agent/` branch |
| Delete | Closes the issue as not planned (reopen it on GitHub) |

Waiting cards start on their own: each time HQ reads the board (every 10 seconds while a page is open), it adds `ready-for-dev` to the waiting cards the planner lets run. So HQ has to be open for a waiting card to start. Your teams and the team of each project are saved in `hq/.hq/board.json` on this computer.

## Zones, colors and parallelism

Each card is colored by the zones it touches: Interface (blue), Server (green), Data (purple), Content (yellow). Each builder agent of a team covers one or more zones.

- Cards on different files run in parallel. When several cards of the same color run at once, the agent of that color **splits into clones** (2 to 4 at most), as strong as the original, with the same skills and rules, each on its own branch.
- A card that touches the same files as a card in progress waits, and starts on its own when that card is done.
- Override on the card: *Run in parallel anyway* (skips the file check, never the 4-clone limit) or *Hold*.

The rules live in `lib/board/planner.ts`, the moves of the board in `lib/board/engine.ts` (pure functions, tested in `tests/board.test.ts`).

## AI settings

The AI writes the specs (and later the plans). Pick its source in **⚙ AI**:

| Provider | What you need |
| --- | --- |
| Claude Code | The `claude` command installed and signed in on this computer. Uses your Claude subscription, no key. HQ runs `claude -p` with no tools and without `ANTHROPIC_API_KEY` in its environment. |
| Anthropic API | An API key |
| OpenAI | An API key |
| DeepSeek | An API key |
| Ollama | A local model |
| No AI | Nothing: your sentences become the criteria |

*Automatic* takes the first ready one (Ollama, Claude Code, then the keys) and falls back to the rules if it fails. Keys are saved in `hq/.hq/ai.json` (mode 600, ignored by git) and never sent back to the page. On a hosted HQ (OAuth mode) the page is read-only: set `AI_PROVIDER`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY` or `ANTHROPIC_API_KEY` in the environment. These keys are never used by the agents, whose key stays in GitHub secrets.

## Signing in

| Mode | When | Token |
| --- | --- | --- |
| Local | Default, when no OAuth App is configured | `GITHUB_TOKEN`, else `gh auth token`. The server only answers on loopback addresses |
| OAuth | `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` set, to host Agent HQ for others | Each user's own, from a GitHub OAuth App, sealed in an `httpOnly` cookie |
| Demo | No token found, or `HQ_AUTH=demo` | None: simulated world |

Either way Agent HQ acts with your own token, and agents only start for the logins in the organisation variable `AGENT_ALLOWED_USERS` (or the workflows' `allowed_users` input). The agents' Anthropic key stays in GitHub secrets.

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

## Next steps

1. The planner through the AI settings, reading the real repo tree for the files of each zone (today it guesses file names from the words of the card).
2. One run per zone of a card (today one run covers all its zones), so clones really work on separate branches.
3. Remove the old API routes (`/api/world`, `/api/stream`, `/api/actions`, `/api/teams`) and their libraries, no longer used by the board.
