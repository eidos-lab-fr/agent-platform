import { HQ } from "@/components/HQ";
import { authState, currentSession } from "@/lib/auth";
import { getWorld } from "@/lib/world";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const state = await authState();

  // OAuth half configured: say what is missing instead of silently showing the demo.
  if (state.mode === "oauth" && state.problem) {
    return (
      <main className="login">
        <div className="login-card">
          <h1>◆ Agent HQ</h1>
          <p className="error">{state.problem}</p>
          <p>{state.fix}</p>
          <p className="muted small">Run `npm run doctor` in the hq folder for a full check.</p>
        </div>
      </main>
    );
  }

  const session = await currentSession();
  if (!session && state.mode === "oauth") {
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
  const initial = await getWorld(session, state.mode).catch(() => null);
  // In demo mode because no token was found: tell the user why, and how to connect.
  const notice = state.mode === "demo" && state.problem ? { problem: state.problem, fix: state.fix ?? "" } : null;
  return <HQ initial={initial} notice={notice} />;
}
