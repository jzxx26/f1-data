import { RaceArchive } from "@/components/archive/RaceArchive";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="text-sm text-white/60">Loading race insights…</div>
      }
    >
      <RaceArchive />
    </Suspense>
  );
}
