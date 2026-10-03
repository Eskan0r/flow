import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const tileVariants = cva(
  "flex h-11 w-11 items-center justify-center rounded-md border-2 font-mono text-sm tabular-nums transition-colors",
  {
    variants: {
      tone: {
        neutral: "border-ink bg-card text-ink hover:bg-line",
        accent: "border-ink bg-ink text-paper",
      },
      solved: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      { tone: "neutral", solved: true, className: "bg-ink text-paper" },
    ],
    defaultVariants: { tone: "neutral", solved: false },
  }
);

interface TileProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof tileVariants> {
  label: string;
}

export const Tile = forwardRef<HTMLButtonElement, TileProps>(
  ({ tone, solved, label, className, ...rest }, ref) => (
    <button ref={ref} type="button" aria-label={label} className={cn(tileVariants({ tone, solved }), className)} {...rest} />
  )
);
Tile.displayName = "Tile";
