"use client";

import type { RaceControlMessage } from "@/lib/live";

export function RaceControlCard({ messages }: { messages: RaceControlMessage[] }) {
  const latest = [...messages].reverse().slice(0, 12);
  return (
    <section className="flex flex-col rounded-3xl border border-white/5 bg-black/40 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <header className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">Race control</p>
        <h2 className="text-lg font-semibold text-white">Messages</h2>
      </header>
      {latest.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/50">No messages yet.</p>
      ) : (
        <ul className="flex max-h-[360px] flex-col gap-2 overflow-auto">
          {latest.map((message, index) => (
            <li key={`${message.Time}-${index}`} className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
              <div className="mb-1 flex gap-2 text-[10px] uppercase tracking-[0.2em] text-white/40">
                {message.Lap ? <span>Lap {message.Lap}</span> : null}
                {message.Flag ? <span>{message.Flag}</span> : message.Category ? <span>{message.Category}</span> : null}
              </div>
              <p className="text-xs leading-relaxed text-white/80">{message.Message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
