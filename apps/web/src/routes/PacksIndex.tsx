import { Link } from "react-router";
import { PACKS } from "@core";

export function PacksIndex() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-8">
      <header className="flex items-center gap-2 py-4">
        <img src="/logo.svg" alt="roflow logo" width={34} height={34} />
        <h1 className="font-display text-2xl font-extrabold tracking-tight">roflow</h1>
      </header>
      <nav aria-label="Packs" className="flex flex-col gap-2">
        <Link
          to="/dailies"
          data-testid="daily-card"
          className="flex h-14 items-center justify-between rounded-lg border-2 border-ink bg-card px-4 hover:bg-line"
        >
          <span className="font-display text-base font-bold text-accent">Daily Puzzles</span>
          <span className="font-mono text-xs text-ink-soft">5 a day</span>
        </Link>
        {PACKS.map((p) => (
          <Link
            key={p.id}
            to={`/pack/${p.id}`}
            data-testid={`pack-${p.id}`}
            className="flex h-14 items-center justify-between rounded-lg border-2 border-ink bg-card px-4 hover:bg-line"
          >
            <span className="font-display text-base font-bold">{p.name}</span>
            <span className="font-mono text-xs text-ink-soft">{p.desc}</span>
          </Link>
        ))}
        <Link
          to="/play"
          data-testid="free-play"
          className="flex h-14 items-center justify-between rounded-lg border-2 border-ink bg-card px-4 hover:bg-line"
        >
          <span className="font-display text-base font-bold">Free play</span>
          <span className="font-mono text-xs text-ink-soft">Random</span>
        </Link>
      </nav>
    </div>
  );
}
