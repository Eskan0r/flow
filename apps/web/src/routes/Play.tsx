import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { DAILY_KINDS, DAILY_SIZES, dailySeed, packById, parseDailySeed } from "@core";
import { WinModal } from "../components/WinModal";
import { Button } from "../components/ui/button";
import { BoardCanvas } from "../features/board/BoardCanvas";
import { getEngine, useBoardStore } from "../stores/board";
import { dailyDoneOn, nextUndoneDaily, recordDailySeed, saveDailyStars, shareText, todayLabel } from "../stores/daily";

export function Play() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const moves = useBoardStore((s) => s.moves);
  const linked = useBoardStore((s) => s.linked);
  const seed = useBoardStore((s) => s.seed);
  const size = useBoardStore((s) => s.size);
  const kind = useBoardStore((s) => s.kind);
  const won = useBoardStore((s) => s.won);
  const refresh = useBoardStore((s) => s.refresh);
  const loadSeed = useBoardStore((s) => s.loadSeed);

  const dailyParam = params.get("daily");
  const packParam = params.get("pack");
  const levelParam = params.get("level");
  const seedParam = params.get("seed");
  const sizeParam = params.get("size");
  const kindParam = params.get("kind");

  const dailyIndex = dailyParam ? Math.min(5, Math.max(1, parseInt(dailyParam, 10) || 1)) : null;
  const pack = packParam ? packById(packParam) : undefined;
  const levelNum = levelParam ? parseInt(levelParam, 10) || 1 : 1;

  const isDaily = dailyIndex !== null;
  const today = todayLabel();

  useEffect(() => {
    const idx = dailyParam ? Math.min(5, Math.max(1, parseInt(dailyParam, 10) || 1)) : null;
    if (idx !== null) {
      const done = dailyDoneOn(today);
      if (done.includes(idx)) {
        navigate("/dailies", { replace: true });
        return;
      }
      loadSeed(dailySeed(today, idx), DAILY_SIZES[idx - 1], DAILY_KINDS[idx - 1]);
      return;
    }
    if (packParam && levelParam) {
      const p = packById(packParam);
      if (p) {
        const n = Math.min(Math.max(1, parseInt(levelParam, 10) || 1), p.count);
        loadSeed(p.seedForLevel(n), p.sizeForLevel(n), p.kind);
      }
      return;
    }
    if (seedParam) {
      const s = Math.min(10, Math.max(5, parseInt(sizeParam ?? "7", 10) || 7));
      const k = kindParam === "hex" ? "hex" : "square";
      loadSeed(seedParam, s, k);
    }
  }, [dailyParam, packParam, levelParam, seedParam, sizeParam, kindParam, today, loadSeed, navigate]);

  useEffect(() => {
    if (won) {
      const eng = getEngine();
      recordDailySeed(eng.seed);
      const parsed = parseDailySeed(eng.seed);
      if (parsed && eng.win) saveDailyStars(parsed.date, parsed.index, eng.win.stars);
      refresh();
    }
  }, [won]);

  const parsedDaily = useMemo(() => parseDailySeed(getEngine().seed), [seed, won]);
  const nextDaily = parsedDaily ? nextUndoneDaily(parsedDaily.date, parsedDaily.index) : null;
  const dailyComplete = parsedDaily ? dailyDoneOn(parsedDaily.date).length >= 5 : false;
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (won && parsedDaily && dailyDoneOn(parsedDaily.date).length >= 5) setModalOpen(true);
  }, [won, parsedDaily]);

  useEffect(() => {
    setModalOpen(false);
  }, [seed]);

  const backTo = isDaily || parsedDaily ? "/dailies" : pack ? `/pack/${pack.id}` : "/";
  const title = parsedDaily ? `Daily ${parsedDaily.index}` : pack ? `${pack.name} ${levelNum}` : "Custom";

  function goNext() {
    if (parsedDaily) {
      if (nextDaily !== null) navigate(`/play?daily=${nextDaily}`);
      else navigate("/dailies");
      return;
    }
    if (pack) {
      if (levelNum < pack.count) navigate(`/play?pack=${pack.id}&level=${levelNum + 1}`);
      else navigate(`/pack/${pack.id}`);
      return;
    }
    useBoardStore.getState().newRandom();
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-xl flex-col overflow-hidden bg-paper text-ink">
      <header className="sticky top-0 z-10 flex shrink-0 items-center gap-2 bg-paper px-3 py-2">
        <Link to={backTo}>
          <Button variant="ghost" size="icon-sm" aria-label="Back" data-testid="back-btn">
            ←
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-base font-bold">{title}</h1>
          <p className="truncate font-mono text-xs tabular-nums text-ink-soft">
            {linked} · {moves} moves · {size}x{size}{kind === "hex" ? " hex" : ""}
          </p>
        </div>
        {won ? (
          <Button data-testid="next-btn" variant="primary" size="sm" onClick={goNext}>
            {parsedDaily ? (nextDaily !== null ? "Next" : "Done") : "Next"}
          </Button>
        ) : null}
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-2 pb-3">
        <BoardCanvas />
      </main>
      {won && parsedDaily && dailyComplete && modalOpen ? (
        <WinModal text={shareText(parsedDaily.date)} onHome={() => navigate("/")} onClose={() => setModalOpen(false)} />
      ) : null}
      <footer className="grid shrink-0 grid-cols-4 gap-2 border-t-2 border-ink px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button
          variant="secondary"
          data-testid="undo-btn"
          onClick={() => {
            getEngine().undo();
            refresh();
          }}
        >
          Undo
        </Button>
        <Button
          variant="secondary"
          data-testid="reset-btn"
          disabled={isDaily || !!parsedDaily}
          title={parsedDaily ? "No resets on dailies" : undefined}
          onClick={() => {
            getEngine().reset();
            refresh();
          }}
        >
          Reset
        </Button>
        <Button
          variant="secondary"
          data-testid="hint-btn"
          onClick={() => {
            getEngine().hint();
            refresh();
          }}
        >
          Hint
        </Button>
        {isDaily || parsedDaily ? (
          <Button variant="secondary" data-testid="daily-list-btn" onClick={() => navigate("/dailies")}>
            List
          </Button>
        ) : (
          <Button
            data-testid="new-btn"
            onClick={() => {
              useBoardStore.getState().newRandom();
            }}
          >
            New
          </Button>
        )}
      </footer>
      <div aria-live="polite" className="sr-only">
        {won ? `Complete. ${linked} linked.` : `${linked} linked.`} {size}x{size}
      </div>
    </div>
  );
}
