import { Link, useParams } from "react-router";
import { packById } from "@core";
import { Button } from "../components/ui/button";

export function PackDetail() {
  const { id = "" } = useParams();
  const pack = packById(id);
  if (!pack) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 pb-8">
        <p>Pack not found.</p>
        <Link to="/" className="underline">Back to packs</Link>
      </main>
    );
  }
  const levels = Array.from({ length: pack.count }, (_, i) => i + 1);
  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-8">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b-2 border-ink bg-paper py-3">
        <Link to="/"><Button variant="ghost" size="icon-sm" aria-label="Back to packs">←</Button></Link>
        <div className="flex-1">
          <h1 className="font-display text-xl font-bold">{pack.name}</h1>
          <p className="text-xs text-ink-soft">{pack.desc}</p>
        </div>
      </header>
      <nav aria-label="Levels" className="mt-4 grid grid-cols-5 justify-items-center gap-2 sm:grid-cols-6">
        {levels.map((n) => (
          <Link
            key={n}
            to={`/play?pack=${pack.id}&level=${n}`}
            data-testid={`level-${n}`}
            className="flex h-11 w-11 items-center justify-center rounded-md border-2 border-ink bg-card font-mono text-sm hover:bg-line"
          >
            {n}
          </Link>
        ))}
      </nav>
    </main>
  );
}
