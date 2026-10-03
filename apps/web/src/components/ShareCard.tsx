import { useRef, useState } from "react";
import { Button } from "./ui/button";

export function ShareCard({ text, testid = "share-card" }: { text: string; testid?: string }) {
  const [copied, setCopied] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  async function copy() {
    const value = text;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        setCopied(true);
      } else {
        throw new Error("no clipboard");
      }
    } catch {
      try {
        areaRef.current?.focus();
        areaRef.current?.select();
        const ok = document.execCommand("copy");
        setCopied(ok);
      } catch {
        areaRef.current?.focus();
        areaRef.current?.select();
        setCopied(false);
      }
    }
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section data-testid={testid} className="rounded-lg border-2 border-ink bg-card p-2">
      <label htmlFor={`${testid}-text`} className="font-mono text-[11px] text-ink-soft">
        Share your result
      </label>
      <textarea
        ref={areaRef}
        id={`${testid}-text`}
        data-testid={`${testid}-text`}
        readOnly
        rows={4}
        value={text}
        onFocus={(e) => e.target.select()}
        className="mt-1 w-full resize-none rounded-md border border-line bg-paper p-2 font-mono text-xs leading-tight"
      />
      <Button data-testid={`${testid}-copy`} variant="secondary" size="sm" className="mt-1.5 h-9 w-full" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </section>
  );
}
