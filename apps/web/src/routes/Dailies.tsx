import { Link } from "react-router";
import { DAILY_COUNT, DAILY_KINDS, DAILY_SIZES } from "@core";
import { ShareCard } from "../components/ShareCard";
import { Button } from "../components/ui/button";
import { dailyDoneOn, shareText, todayLabel } from "../stores/daily";

export function Dailies() {
  const today = todayLabel();
  const done = dailyDoneOn(today);
  const doneSet = new Set(done);
  const items = Array.from({ length: DAILY_COUNT }, (_, i) => i + 1);

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-8">
      <header className="flex items-center gap-2 py-3">
        <Link to="/">
          <Button variant="ghost" size="icon-sm" aria-label="Back to packs">
            ←
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-display text-lg font-bold">Daily Puzzles</h1>
          <p className="font-mono text-xs text-ink-soft">{today}</p>
        </div>
        <span className="font-mono text-sm tabular-nums">{done.length}/{DAILY_COUNT}</span>
      </header>
      <nav aria-label="Dailies" className="flex flex-col gap-2">
        {items.map((i) => {
          const isDone = doneSet.has(i);
          const kind = DAILY_KINDS[i - 1];
          const size = DAILY_SIZES[i - 1];
          if (isDone) {
            return (
              <span
                key={i}
                aria-disabled="true"
                data-testid={`daily-${i}`}
                className="flex h-14 items-center justify-between rounded-lg border-2 border-ink bg-line px-4"
              >
                <span className="font-display text-base font-bold">Daily {i}</span>
                <span className="font-mono text-xs text-ink-soft">
                  {size}x{size}{kind === "hex" ? " hex" : ""} · done
                </span>
              </span>
            );
          }
          return (
            <Link
              key={i}
              to={`/play?daily=${i}`}
              data-testid={`daily-${i}`}
              className="flex h-14 items-center justify-between rounded-lg border-2 border-ink bg-card px-4 hover:bg-line"
            >
              <span className="font-display text-base font-bold">Daily {i}</span>
              <span className="font-mono text-xs text-ink-soft">
                {size}x{size}{kind === "hex" ? " hex" : ""}
              </span>
            </Link>
          );
        })}
      </nav>
      {done.length >= DAILY_COUNT ? (
        <div className="mt-3">
          <ShareCard text={shareText(today)} testid="daily-share" />
        </div>
      ) : null}
    </main>
  );
}
