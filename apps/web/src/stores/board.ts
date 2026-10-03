import { FlowEngine, randomSeed } from "@core";
import type { BoardKind } from "@core";
import { create } from "zustand";

const engine = new FlowEngine();
engine.loadLevel("seed", 0, "flow-regular-1", 5, "square");

interface BoardState {
  version: number;
  seed: string;
  size: number;
  kind: BoardKind;
  moves: number;
  linked: string;
  won: boolean;
  refresh: () => void;
  newRandom: () => void;
  loadSeed: (seed: string, size: number, kind: BoardKind) => void;
}

function syncSnapshot() {
  return {
    seed: engine.seed,
    size: engine.size,
    kind: engine.topo.kind,
    moves: engine.moves,
    linked: `${engine.connectedCount()}/${engine.numPairs}`,
    won: engine.won,
  };
}

export const useBoardStore = create<BoardState>()((set) => ({
  version: 0,
  ...syncSnapshot(),
  refresh: () => set((s) => ({ ...syncSnapshot(), version: s.version + 1 })),
  newRandom: () => {
    const sd = randomSeed();
    engine.loadLevel("seed", 0, sd, engine.size, engine.topo.kind);
    set((s) => ({ ...syncSnapshot(), version: s.version + 1 }));
  },
  loadSeed: (seed, size, kind) => {
    engine.loadLevel("seed", 0, seed, size, kind);
    set((s) => ({ ...syncSnapshot(), version: s.version + 1 }));
  },
}));

export function getEngine() {
  return engine;
}
