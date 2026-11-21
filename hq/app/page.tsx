import { Suspense } from "react";
import { Home } from "@/components/board/Home";

export default function Page() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
