"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-black/60 backdrop-blur-xl">
        <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
          <div className="flex items-center gap-3 text-sm font-medium uppercase tracking-[0.3em] text-white/80">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-500/80 to-rose-500/80 text-base font-semibold shadow-lg shadow-rose-500/20">
              F1
            </span>
            <span className="hidden text-xs text-white/60 sm:inline">
              Race Insights · FastF1
            </span>
          </div>
          <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-white/50">
            Post-race analytics
          </span>
        </nav>
      </header>
      <main className="relative flex-1">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_-10%,rgba(248,113,113,0.25),transparent_55%),radial-gradient(circle_at_80%_0%,rgba(251,191,36,0.18),transparent_45%)]" />
        <AnimatePresence mode="wait">
          <motion.section
            key={pathname}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="relative z-10 mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-12 lg:py-14"
          >
            {children}
          </motion.section>
        </AnimatePresence>
      </main>
      <footer className="border-t border-white/5 bg-black/60 py-6 text-center text-xs text-white/40">
        Data courtesy of FastF1 · Built for race fans & strategists
      </footer>
    </div>
  );
}
