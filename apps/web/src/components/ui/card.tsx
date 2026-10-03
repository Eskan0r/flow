import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Card({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("rounded-lg border-2 border-ink bg-card", className)} {...rest} />;
}

export function CardHeader({ title, subtitle, meta }: { title: ReactNode; subtitle?: ReactNode; meta?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 px-4 pt-3">
      <div className="min-w-0">
        <h2 className="font-display text-xl font-bold leading-none tracking-tight">{title}</h2>
        {subtitle ? <p className="mt-1 truncate text-sm text-ink-soft">{subtitle}</p> : null}
      </div>
      {meta ? <div className="shrink-0 font-mono text-xs tabular-nums">{meta}</div> : null}
    </header>
  );
}

export function CardContent({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 pb-4 pt-3", className)} {...rest} />;
}
