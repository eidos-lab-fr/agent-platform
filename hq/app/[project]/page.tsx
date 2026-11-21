import { BoardView } from "@/components/board/BoardView";

export default async function ProjectPage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params;
  return <BoardView slug={decodeURIComponent(project)} />;
}
