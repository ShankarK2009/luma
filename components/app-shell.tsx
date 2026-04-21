import Link from "next/link";
import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

import { BottomNav } from "@/components/bottom-nav";

export function AppShell({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="relative min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 pb-28 pt-5">
        <header className="mb-5 flex items-center justify-between">
          <div>
            <Link
              href="/today"
              prefetch={false}
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-2 text-[0.72rem] uppercase tracking-[0.24em] text-[var(--text-soft)]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Luma
            </Link>
            <div className="mt-3 space-y-1">
              <h1 className="text-[2rem] font-semibold leading-none tracking-[-0.04em] text-[var(--text-strong)]">
                {title}
              </h1>
              <p className="max-w-[30ch] text-sm leading-6 text-[var(--text-soft)]">
                {subtitle}
              </p>
            </div>
          </div>
          <Link
            href="/onboarding"
            prefetch={false}
            className="rounded-full border border-white/12 px-4 py-2 text-sm text-[var(--text-soft)] transition hover:bg-white/7 hover:text-[var(--text-strong)]"
          >
            Setup
          </Link>
        </header>

        <main className="flex flex-1 flex-col gap-4">{children}</main>
      </div>

      <BottomNav />
    </div>
  );
}
