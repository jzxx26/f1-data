"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

const NAV = [
  { href: "/", label: "Archive" },
  { href: "/live", label: "Live" },
];

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  // The live dashboard fills exactly one screen: slim header, no footer, no page scroll.
  const fullScreen = pathname.startsWith("/live");
  return (
    <div
      className={cn(
        "relative flex w-full flex-col bg-[#0a0a0c] text-white/90",
        fullScreen ? "h-dvh overflow-hidden" : "min-h-screen"
      )}
    >
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0a0a0c]/85 backdrop-blur-xl">
        <nav
          className={cn(
            "mx-auto flex w-full items-center justify-between px-4 sm:px-6 lg:px-8",
            fullScreen ? "h-10" : "h-14 sm:h-16"
          )}
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-amber-500 text-[11px] font-black tracking-tight text-black shadow-[0_0_24px_-6px_rgba(239,68,68,0.6)]">
              F1
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-[11px] font-bold uppercase tracking-[0.4em] text-white/85">
                Pitwall
              </span>
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                Analytics · FastF1 · Live timing
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
            {NAV.map((item) => {
              const current = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-full px-4 py-1 text-[11px] uppercase tracking-[0.25em] transition-colors",
                    current ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <span className="hidden rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-white/50 sm:inline-flex">
            v0.1 · build
          </span>
        </nav>
      </header>
      <main className={cn("relative flex-1", fullScreen && "min-h-0")}>
        <section
          className={cn(
            "relative z-10 mx-auto w-full",
            fullScreen ? "h-full px-2 py-2" : "px-3 py-6 sm:px-5 sm:py-8 lg:px-8 lg:py-10"
          )}
        >
          {children}
        </section>
      </main>
      {fullScreen ? null : (
        <footer className="border-t border-white/[0.06] bg-[#0a0a0c] py-6 text-center text-[11px] uppercase tracking-[0.3em] text-white/35">
          Data courtesy of FastF1
        </footer>
      )}
    </div>
  );
}
