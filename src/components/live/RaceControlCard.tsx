"use client";

import type { RaceControlMessage } from "@/lib/live";

export function RaceControlCard({ messages }: { messages: RaceControlMessage[] }) {
  const latest = [...messages].reverse().slice(0, 30);
  if (latest.length === 0) return <p className="py-4 text-center text-xs text-white/50">No messages yet.</p>;
  return (
    <ul className="flex h-full flex-col gap-1.5 overflow-auto pr-1">
      {latest.map((message, index) => (
        <li key={`${message.Time}-${index}`} className="rounded-xl border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
          <div className="flex gap-2 text-[9px] uppercase tracking-[0.2em] text-white/40">
            {message.Lap ? <span>Lap {message.Lap}</span> : null}
            {message.Flag ? <span>{message.Flag}</span> : message.Category ? <span>{message.Category}</span> : null}
          </div>
          <p className="text-[11px] leading-snug text-white/80">{message.Message}</p>
        </li>
      ))}
    </ul>
  );
}
