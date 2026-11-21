import { HQ } from "@/components/HQ";
import { isDemo } from "@/lib/config";
import { getSession } from "@/lib/session";
import { getWorld } from "@/lib/world";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const session = await getSession();
  if (!session && !isDemo()) {
    return (
      <main className="login">
        <div className="login-card">
          <h1>◆ Agent HQ</h1>
          <p>Your agents' headquarters. Sign in with the GitHub account allowed to launch them.</p>
          {error && <p className="error">{error}</p>}
          <a className="primary big" href="/api/auth/login">
            Sign in with GitHub
          </a>
        </div>
      </main>
    );
  }
  const initial = await getWorld(session).catch(() => null);
  return <HQ initial={initial} />;
}
