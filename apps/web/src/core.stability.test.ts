import { describe, expect, it } from "vitest";
import { generateLevel, packById, validateLevel } from "@core";

describe("core stability contract", () => {
  it("same seed plus size gives same puzzle", () => {
    const a = generateLevel("flow-regular-1", 5, 4, { timeBudgetMs: 800 });
    const b = generateLevel("flow-regular-1", 5, 4, { timeBudgetMs: 800 });
    expect(JSON.stringify(a.pairs)).toBe(JSON.stringify(b.pairs));
    expect(JSON.stringify(a.solution)).toBe(JSON.stringify(b.solution));
  });

  it("regular pack level 1 validates", () => {
    const pack = packById("regular");
    expect(pack).toBeDefined();
    const n = 1;
    const level = generateLevel(pack!.seedForLevel(n), pack!.sizeForLevel(n), null, { timeBudgetMs: 800 });
    expect(validateLevel(level).ok).toBe(true);
  });

  it("daily seeds stay parseable", () => {
    const level = generateLevel("daily-2026-10-03-1", 5, 4, { timeBudgetMs: 800 });
    expect(level.pairs.length).toBeGreaterThan(1);
    expect(validateLevel(level).ok).toBe(true);
  });
});
