import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Badge({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-sm border border-line bg-card px-2 font-mono text-xs tabular-nums text-ink",
        className
      )}
      {...rest}
    />
  );
}
