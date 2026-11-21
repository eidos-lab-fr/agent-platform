// Configuration lue dans l'environnement (voir .env.example).

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export const config = {
  clientId: process.env.GITHUB_CLIENT_ID ?? "",
  clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
  appUrl: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  sessionSecret: process.env.SESSION_SECRET ?? "",
  allowedLogins: list(process.env.ALLOWED_LOGINS ?? "AdrienBalcioglu").map((l) => l.toLowerCase()),
  org: process.env.GITHUB_ORG ?? "eidos-lab-fr",
  platformRepo: process.env.PLATFORM_REPO ?? "agent-platform",
  repos: list(process.env.HQ_REPOS),
};

/** Sans application OAuth configurée, Agent HQ tourne en mode démo. */
export const isDemo = () => !config.clientId || !config.clientSecret || !config.sessionSecret;
