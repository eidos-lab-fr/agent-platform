// Configuration read from the environment (see .env.example). Everything has a default:
// with no .env.local at all, Agent HQ signs you in with the GitHub CLI token (local mode),
// or runs the demo if there is none.

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export const config = {
  /** auto (default), local, oauth or demo. */
  auth: (process.env.HQ_AUTH ?? "auto").trim().toLowerCase(),
  clientId: process.env.GITHUB_CLIENT_ID ?? "",
  clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
  /** Public URL, only needed for a hosted OAuth setup. Otherwise the URL of the request is used. */
  appUrl: (process.env.APP_URL ?? "").trim().replace(/\/$/, ""),
  sessionSecret: process.env.SESSION_SECRET ?? "",
  /** Who may sign in through OAuth. Local mode always acts as the owner of the CLI token. */
  allowedLogins: list(process.env.ALLOWED_LOGINS).map((l) => l.toLowerCase()),
  org: process.env.GITHUB_ORG || "eidos-lab-fr",
  platformRepo: process.env.PLATFORM_REPO || "agent-platform",
  /** Branch of the platform repo where Agent HQ keeps its own data (teams). Never the default branch. */
  dataBranch: process.env.HQ_DATA_BRANCH || "hq-data",
  repos: list(process.env.HQ_REPOS),
};

export const hasOAuth = () => Boolean(config.clientId && config.clientSecret);
