import { useEffect, useRef } from "react";
import { hexCellCenter, hexCornerOffsets, hexLayout, hexPixelToCell, type HexLayout } from "@core";
import { getEngine, useBoardStore } from "../../stores/board";
import { PIPE_COLORS } from "./palette";

export function BoardCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const layRef = useRef<HexLayout | null>(null);
  const version = useBoardStore((s) => s.version);
  const kind = useBoardStore((s) => s.kind);
  const refresh = useBoardStore((s) => s.refresh);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    function fit() {
      const c = canvasRef.current;
      const wEl = wrapRef.current;
      if (!c || !wEl) return;
      const engine = getEngine();
      const rect = wEl.getBoundingClientRect();
      const availW = Math.max(200, rect.width || 360);
      const availH = Math.max(200, rect.height || 360);
      let w: number;
      let h: number;
      if (engine.topo.kind === "hex") {
        const unit = hexLayout(engine.topo.rows, engine.topo.cols, 1);
        const s = Math.max(6, Math.floor(Math.min(availW / unit.w, availH / unit.h)));
        const lay = hexLayout(engine.topo.rows, engine.topo.cols, s);
        layRef.current = lay;
        w = Math.floor(lay.w);
        h = Math.floor(lay.h);
      } else {
        layRef.current = null;
        const side = Math.max(200, Math.floor(Math.min(availW, availH)));
        w = side;
        h = side;
      }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      draw(c, w, h);
    }

    function draw(c: HTMLCanvasElement, w: number, h: number) {
      const engine = getEngine();
      const g = c.getContext("2d");
      if (!g) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      let pipeW: number;
      let dotR: number;
      let edge: number;
      if (engine.topo.kind === "hex" && layRef.current) {
        const lay = layRef.current;
        g.fillStyle = "#F1E8D2";
        g.fillRect(0, 0, w, h);
        const offs = hexCornerOffsets(lay.s * 0.97);
        g.strokeStyle = "#8A7D64";
        g.lineWidth = 1.5;
        g.beginPath();
        for (let r = 0; r < engine.topo.rows; r++) {
          for (let cc = 0; cc < engine.topo.cols; cc++) {
            const ctr = hexCellCenter(lay, r, cc);
            for (let k = 0; k < 6; k++) {
              const a = offs[k];
              const b = offs[(k + 1) % 6];
              g.moveTo(ctr.x + a.x, ctr.y + a.y);
              g.lineTo(ctr.x + b.x, ctr.y + b.y);
            }
          }
        }
        g.stroke();
        g.strokeStyle = "#191817";
        g.lineWidth = 2;
        g.strokeRect(1, 1, w - 2, h - 2);
        pipeW = lay.s * 0.62;
        dotR = lay.s * 0.32;
        edge = Math.max(2, lay.s * 0.08);
      } else {
        const n = engine.topo.cols;
        const cell = w / n;
        g.fillStyle = "#FFFDF7";
        g.fillRect(0, 0, w, h);
        g.strokeStyle = "#E2D9C8";
        g.lineWidth = 1;
        g.beginPath();
        for (let i = 1; i < n; i++) {
          const p = Math.round(i * cell) + 0.5;
          g.moveTo(p, 0);
          g.lineTo(p, h);
          g.moveTo(0, p);
          g.lineTo(w, p);
        }
        g.stroke();
        g.strokeStyle = "#191817";
        g.lineWidth = 2;
        g.strokeRect(1, 1, w - 2, h - 2);
        pipeW = cell * 0.62;
        dotR = cell * 0.3;
        edge = 3;
      }

      const center = (r: number, cc: number): [number, number] => {
        if (engine.topo.kind === "hex" && layRef.current) {
          const p = hexCellCenter(layRef.current, r, cc);
          return [p.x, p.y];
        }
        const cell = w / engine.topo.cols;
        return [(cc + 0.5) * cell, (r + 0.5) * cell];
      };
      g.lineCap = "round";
      g.lineJoin = "round";
      for (let i = 0; i < engine.numPairs; i++) {
        const path = engine.paths[i];
        if (path.length < 2) continue;
        const pts = path.map(([r, c]) => center(r, c));
        g.strokeStyle = "#191817";
        g.lineWidth = pipeW + edge;
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
        g.stroke();
        g.strokeStyle = PIPE_COLORS[i % PIPE_COLORS.length];
        g.lineWidth = pipeW;
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
        g.stroke();
      }
      for (let i = 0; i < engine.numPairs; i++) {
        const col = PIPE_COLORS[i % PIPE_COLORS.length];
        for (let k = 0; k < 2; k++) {
          const [x, y] = center(engine.pairs[i][k][0], engine.pairs[i][k][1]);
          g.beginPath();
          g.arc(x, y, dotR + edge * 0.7, 0, Math.PI * 2);
          g.fillStyle = "#191817";
          g.fill();
          g.beginPath();
          g.arc(x, y, dotR, 0, Math.PI * 2);
          g.fillStyle = col;
          g.fill();
          if (engine.done[i]) {
            g.beginPath();
            g.arc(x, y, dotR + edge * 1.2, 0, Math.PI * 2);
            g.strokeStyle = "#FFFFFF";
            g.lineWidth = 2;
            g.stroke();
          }
        }
      }
    }

    fit();
    const ro = new ResizeObserver(() => fit());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [version]);

  function toCell(e: React.PointerEvent): [number, number] | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const engine = getEngine();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (engine.topo.kind === "hex" && layRef.current) {
      return hexPixelToCell(layRef.current, engine.topo.rows, engine.topo.cols, x, y);
    }
    const cell = rect.width / engine.topo.cols;
    const c = Math.floor(x / cell);
    const r = Math.floor(y / cell);
    if (!engine.inBounds(r, c)) return null;
    return [r, c];
  }

  return (
    <div ref={wrapRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2">
      <canvas
        ref={canvasRef}
        data-testid="board"
        data-kind={kind}
        className="block max-h-full max-w-full touch-none select-none"
        role="img"
        aria-label="Flow board. Use keyboard list to play without pointer."
        onPointerDown={(e) => {
          const cell = toCell(e);
          if (!cell) return;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          getEngine().pointerDown(cell[0], cell[1], e.pointerId);
          refresh();
        }}
        onPointerMove={(e) => {
          const eng = getEngine();
          if (!eng.active || e.pointerId !== eng.active.pid) return;
          const cell = toCell(e);
          if (!cell) return;
          eng.pointerMove(cell[0], cell[1], e.pointerId);
          refresh();
        }}
        onPointerUp={(e) => {
          const eng = getEngine();
          if (!eng.active || e.pointerId !== eng.active.pid) return;
          eng.pointerUp(e.pointerId);
          refresh();
        }}
      />
    </div>
  );
}
