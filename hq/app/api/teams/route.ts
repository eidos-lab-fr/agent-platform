import { NextResponse } from "next/server";
import { isDemo } from "@/lib/config";
import { failure, guard } from "@/lib/route-guard";
import { getSession } from "@/lib/session";
import { deployToRepo, filesForRepo } from "@/lib/team-deploy";
import { demoStore, githubStore } from "@/lib/team-store";
import { teamFromTemplate } from "@/lib/team-templates";
import { validateTeam, type Team } from "@/lib/teams";

export const dynamic = "force-dynamic";

type Op =
  | { op: "create"; template: string | null; name?: string }
  | { op: "save"; team: Team }
  | { op: "delete"; id: string }
  | { op: "preview"; id: string; repo: string }
  | { op: "deploy"; id: string; repo: string };

export async function GET() {
  const session = await getSession();
  if (!session && !isDemo()) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const store = session ? githubStore(session.token) : demoStore;
    return NextResponse.json({ teams: await store.list() });
  } catch (e) {
    return failure(e);
  }
}

export async function POST(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const store = g.session ? githubStore(g.session.token) : demoStore;
  const body = (await req.json().catch(() => null)) as Op | null;
  try {
    switch (body?.op) {
      case "create": {
        const team = await store.save(teamFromTemplate(body.template, body.name));
        return NextResponse.json({ ok: true, message: `Team "${team.name}" is ready.`, team });
      }
      case "save": {
        const problem = validateTeam(body.team);
        if (problem) return NextResponse.json({ ok: false, message: problem }, { status: 400 });
        const team = await store.save(body.team);
        return NextResponse.json({ ok: true, message: "Team saved.", team });
      }
      case "delete":
        await store.remove(body.id);
        return NextResponse.json({ ok: true, message: "Team deleted." });
      case "preview":
      case "deploy": {
        const team = (await store.list()).find((t) => t.id === body.id);
        if (!team) return NextResponse.json({ ok: false, message: "Unknown team." }, { status: 404 });
        if (body.op === "preview") return NextResponse.json({ ok: true, message: "", files: filesForRepo(team, body.repo) });
        const files = filesForRepo(team, body.repo);
        if (!files.length) return NextResponse.json({ ok: false, message: "No agent of this team is placed on that island." }, { status: 400 });
        const prUrl = g.session ? (await deployToRepo(g.session.token, team, body.repo)).prUrl : null;
        const saved = await store.save({
          ...team,
          deployments: [{ repo: body.repo, at: new Date().toISOString(), prUrl }, ...team.deployments.filter((d) => d.repo !== body.repo)],
        });
        return NextResponse.json({
          ok: true,
          message: prUrl ? `Pull request opened on ${body.repo}: merge it to put the team to work.` : `${files.length} files ready (demo: no pull request is opened).`,
          url: prUrl ?? undefined,
          team: saved,
        });
      }
      default:
        return NextResponse.json({ ok: false, message: "Unknown operation." }, { status: 400 });
    }
  } catch (e) {
    return failure(e);
  }
}
