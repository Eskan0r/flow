import { useEffect, useRef } from "react";
import { ShareCard } from "./ShareCard";
import { Button } from "./ui/button";

export function WinModal({
  text,
  onHome,
  onClose,
}: {
  text: string;
  onHome: () => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share your result"
        data-testid="win-modal"
        className="w-full max-w-sm rounded-lg border-2 border-ink bg-card p-3"
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-base font-bold">Complete</h2>
          <Button variant="ghost" size="icon-sm" aria-label="View board" data-testid="win-close" onClick={onClose} ref={closeRef}>
            ✕
          </Button>
        </div>
        <ShareCard text={text} testid="daily-share" />
        <Button variant="primary" data-testid="win-home" className="mt-2 w-full" onClick={onHome}>
          Home
        </Button>
      </div>
    </div>
  );
}
