# agent-platform

Agent-driven development for GitHub repositories, built on GitHub Actions and [Claude Code](https://github.com/anthropics/claude-code-action).

A ticket goes in, a reviewed pull request comes out. Each repository plugs into the platform with three thin caller workflows; all the logic lives here, in reusable workflows and shared agent rules.

## How it works

On every connected repository:

1. An issue labelled `scope:<x>` and then `ready-for-dev` starts the **dev agent** for that scope. It reads the spec, writes the tests, writes the code and opens a PR from a branch named `agent/<issue number>-<slug>`.
2. Every `agent/*` PR goes through **three review agents** in parallel: spec and scope, security, tests. The verdict is a label: `review:ok` or `review:changes`.
3. A `@claude` comment on an issue or a PR asks for a fix.
4. Status comes from labels and pull requests: `ready-for-dev`, an open `agent/*` PR, `review:ok`, `needs-human` when an agent is stuck. [Agent HQ](hq/README.md) shows it as a board. There is no GitHub Project to maintain.

A human always merges. Agents cannot merge, cannot push to `main` and cannot force-push.

## Layout

| Path | Content |
| --- | --- |
| `.github/workflows/reusable-*.yml` | The agent logic, called by each repository |
| `.github/workflows/onboard-repo.yml` | Connects a new repository in one click |
| `agents/` | Shared rules: dev agent, scope-less dev agent, three reviewers, onboarding agent |
| `templates/` | Files dropped into each repository: caller workflows, issue template |
| `hq/` | Agent HQ, a gamified web app to create tasks, hand them to agents and watch them work, without the GitHub UI (see [hq/README.md](hq/README.md)) |

Each repository keeps what is specific to it in `.github/agents/`: one `dev-<scope>.md` per scope, and optionally `_commun-dev.md` and `review-<reviewer>.md`, which add to the shared rules.

The agent rules and workflow names are written in French, the working language of the team.

## Using it in your own organisation

The workflows reference `eidos-lab-fr/agent-platform`. To run the platform yourself:

1. Fork this repository into your organisation and replace `eidos-lab-fr/agent-platform` with `<your-org>/agent-platform` in `.github/workflows/` and `templates/callers/`.
2. Add two secrets to your fork: `ANTHROPIC_API_KEY` and `PROJECT_TOKEN` (a classic token with the `repo` and `workflow` scopes).
3. In **Settings → Actions → General → Access**, make the fork accessible from the repositories of your organisation.
4. Install the Claude GitHub App on the repositories you want to connect.
5. Create the organisation variable `AGENT_ALLOWED_USERS` (**Settings → Secrets and variables → Actions → Variables**) with the logins allowed to trigger agents, comma-separated. Without it, the workflows fall back to their `allowed_users` input.

## Connecting a repository

1. **Actions** → **Onboarder un repo** → **Run workflow**, with the repository name.
2. Review and merge the PR opened by the onboarding agent.
3. Protect the default branch if the organisation has no global ruleset.

Any change to this repository applies immediately to every connected repository: test it on a sandbox repository first.

## Security model

Agents spend API credits and write code, so who can start them matters, especially on a public repository.

- **Only allow-listed accounts trigger agents.** The dev agent and the `@claude` workflow check the login of the account that added the label or wrote the comment against `AGENT_ALLOWED_USERS` (or the `allowed_users` input). A comment or a label from anyone else is ignored, and no API call is made.
- **Forks never trigger agents.** Review agents only run on `agent/*` branches of the repository itself. A pull request from a fork is skipped, and GitHub does not hand secrets to fork PRs.
- **Secrets stay in GitHub.** Nothing is hard-coded. A repository that calls these workflows uses its own secrets, never those of this repository.
- **Agents have a narrow toolbox.** Each workflow lists the tools the agent may use. Merging, pushing to `main` and force-pushing are denied.
- **Issue text is untrusted input.** On a public repository, anyone can open an issue. An agent only reads it once an allow-listed account labels it `ready-for-dev` or mentions `@claude`, so read an outside issue before you hand it to an agent.

To report a vulnerability, open a [private security advisory](https://github.com/eidos-lab-fr/agent-platform/security/advisories/new).

## License

[MIT](LICENSE) © 2026 Eidos Lab
