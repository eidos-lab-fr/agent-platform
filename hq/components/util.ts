export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

export function repoName(fullName: string): string {
  return fullName.split("/")[1] ?? fullName;
}

export function parisHourNow(): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(new Date()),
  );
}

const ROLE_NAMES: Record<string, string> = { spec: "spec", securite: "security", tests: "tests", claude: "@claude" };

/** Display name of an agent: "dev front", "security", "@claude"… */
export function agentName(role: string, scope: string | null): string {
  return role === "dev" ? `dev ${scope ?? "general"}` : (ROLE_NAMES[role] ?? role);
}
