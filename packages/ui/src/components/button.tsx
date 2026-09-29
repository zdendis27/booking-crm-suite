import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../cn";

export type ButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "outline" | "danger";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

const variants: Record<ButtonVariant, string> = {
  primary:
    "text-white bg-[image:var(--gradient-brand)] bg-[length:160%_160%] shadow-glow hover:bg-[position:100%_50%] hover:shadow-[0_14px_44px_-10px_rgb(109_94_252/0.7)]",
  secondary: "bg-surface text-fg border border-border shadow-xs hover:bg-surface-2 hover:border-border-strong",
  soft: "bg-accent-soft text-accent hover:brightness-95",
  ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
  outline: "border border-border-strong text-fg hover:bg-surface-2",
  danger: "bg-danger text-white shadow-xs hover:brightness-110",
};

const sizes: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-xs gap-1.5 rounded-sm",
  sm: "h-9 px-3.5 text-sm gap-2 rounded-md",
  md: "h-10 px-4 text-sm gap-2 rounded-md",
  lg: "h-12 px-6 text-base gap-2.5 rounded-lg",
  icon: "h-10 w-10 rounded-md",
  "icon-sm": "h-8 w-8 rounded-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  asChild?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, asChild, leading, trailing, children, disabled, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      className={cn(
        "relative inline-flex select-none items-center justify-center whitespace-nowrap font-medium outline-none transition-all duration-200",
        "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : leading}
          {children}
          {!loading && trailing}
        </>
      )}
    </Comp>
  );
});
