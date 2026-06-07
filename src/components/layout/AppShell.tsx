"use client";

import { ReactNode } from "react";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="relative flex min-h-screen w-full flex-col bg-[#0a0a0c] text-white/90">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0a0a0c]/85 backdrop-blur-xl">
        <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-amber-500 text-[11px] font-black tracking-tight text-black shadow-[0_0_24px_-6px_rgba(239,68,68,0.6)]">
              F1
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-[11px] font-bold uppercase tracking-[0.4em] text-white/85">
                Pitwall
              </span>
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                Post-race analytics · FastF1
              </span>
            </div>
          </div>
          <span className="hidden rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-white/50 sm:inline-flex">
            v0.1 · build
          </span>
        </nav>
      </header>
      <main className="relative flex-1">
        <section className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
          {children}
        </section>
      </main>
      <footer className="border-t border-white/[0.06] bg-[#0a0a0c] py-6 text-center text-[11px] uppercase tracking-[0.3em] text-white/35">
        Data courtesy of FastF1
      </footer>
    </div>
  );
}
