import { HQ } from "@/components/HQ";
import { isDemo } from "@/lib/config";
import { getSession } from "@/lib/session";
import { getWorld } from "@/lib/world";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const { erreur } = await searchParams;
  const session = await getSession();
  if (!session && !isDemo()) {
    return (
      <main className="login">
        <div className="login-card">
          <h1>◆ Agent HQ</h1>
          <p>Le QG de tes agents. Connecte-toi avec le compte GitHub autorisé à les lancer.</p>
          {erreur && <p className="error">{erreur}</p>}
          <a className="primary big" href="/api/auth/login">
            Se connecter avec GitHub
          </a>
        </div>
      </main>
    );
  }
  const initial = await getWorld(session).catch(() => null);
  return <HQ initial={initial} />;
}
