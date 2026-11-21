import type { Metadata } from "next";
import { BoardProvider } from "@/components/board/store";
import { authState, currentSession } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent HQ",
  description: "One board for your ideas and the agents that build them",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const state = await authState();
  const session = state.mode === "oauth" && !state.problem ? await currentSession() : null;
  let body: React.ReactNode = <BoardProvider>{children}</BoardProvider>;

  // Hosted with an OAuth App: sign in first. Half configured: say what is missing.
  if (state.mode === "oauth" && (state.problem || !session)) {
    body = (
      <main className="login">
        <div className="login-card">
          <h1>◆ Agent HQ</h1>
          {state.problem ? (
            <>
              <p className="error">{state.problem}</p>
              <p>{state.fix}</p>
            </>
          ) : (
            <>
              <p>One board for your ideas and the agents that build them.</p>
              <a className="primary big" href="/api/auth/login">
                Sign in with GitHub
              </a>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
      </head>
      <body>{body}</body>
    </html>
  );
}
