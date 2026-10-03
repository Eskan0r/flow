import { generateLevel } from "@core";

self.onmessage = (e: MessageEvent<{ seed: string; size: number }>) => {
  const { seed, size } = e.data;
  try {
    const level = generateLevel(seed, size, null, { timeBudgetMs: 1200 });
    self.postMessage({ ok: true, level });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
};
