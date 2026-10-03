import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-mono text-sm font-medium rounded-md border-2 border-ink transition-colors disabled:opacity-50 disabled:cursor-not-allowed [&:focus-visible]:outline-2 [&:focus-visible]:outline-offset-2",
  {
    variants: {
      variant: {
        primary: "bg-accent text-white border-ink hover:bg-[#c94a26]",
        secondary: "bg-card text-ink hover:bg-line",
        ghost: "bg-transparent border-transparent hover:border-line hover:bg-card",
      },
      size: {
        sm: "h-9 px-3 min-w-11",
        md: "h-11 px-4 min-w-11",
        lg: "h-12 px-6",
        icon: "h-11 w-11",
        "icon-sm": "h-9 w-9",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size, className, type = "button", ...rest }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...rest} />
  )
);
Button.displayName = "Button";
