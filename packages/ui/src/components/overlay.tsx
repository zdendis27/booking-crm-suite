"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../cn";

const sizes = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  hideClose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof sizes;
  className?: string;
  hideClose?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ui-overlay fixed inset-0 z-50 bg-black/45 backdrop-blur-[3px]" />
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <DialogPrimitive.Content
            className={cn(
              "ui-dialog pointer-events-auto flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl border border-border bg-surface shadow-lg outline-none sm:rounded-xl",
              sizes[size],
              className,
            )}
          >
            {(title || description) && (
              <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-5">
                <div className="min-w-0">
                  <DialogPrimitive.Title className="text-lg font-semibold tracking-tight">{title}</DialogPrimitive.Title>
                  <DialogPrimitive.Description className={cn("mt-1 text-sm text-fg-muted", !description && "sr-only")}>
                    {description ?? title}
                  </DialogPrimitive.Description>
                </div>
                {!hideClose && (
                  <DialogPrimitive.Close className="rounded-sm p-1.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg" aria-label="Zavřít">
                    <X className="h-5 w-5" />
                  </DialogPrimitive.Close>
                )}
              </div>
            )}
            <div className="ui-scroll min-h-0 flex-1 overflow-y-auto px-5 py-3">{children}</div>
            {footer && <div className="flex flex-col-reverse gap-2 border-t border-border bg-surface-2/60 px-5 py-3.5 sm:flex-row sm:justify-end safe-bottom">{footer}</div>}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = "sm:w-[520px]",
  header,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  header?: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ui-overlay fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-end sm:items-stretch">
          <DialogPrimitive.Content
            className={cn(
              "ui-sheet pointer-events-auto flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-xl border-border bg-surface shadow-lg outline-none sm:max-h-none sm:rounded-none sm:border-l",
              width,
            )}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="truncate text-lg font-semibold tracking-tight">{title}</DialogPrimitive.Title>
                <DialogPrimitive.Description className={cn("mt-0.5 text-sm text-fg-muted", !description && "sr-only")}>
                  {description ?? title}
                </DialogPrimitive.Description>
                {header}
              </div>
              <DialogPrimitive.Close className="rounded-sm p-1.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg" aria-label="Zavřít">
                <X className="h-5 w-5" />
              </DialogPrimitive.Close>
            </div>
            <div className="ui-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>
            {footer && <div className="border-t border-border bg-surface-2/60 px-5 py-3.5 safe-bottom">{footer}</div>}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  align = "start",
  className,
  side = "bottom",
}: {
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          side={side}
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            "ui-menu z-50 rounded-lg border border-border bg-surface p-3 shadow-lg outline-none max-w-[calc(100vw-24px)]",
            className,
          )}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

export function Menu({
  trigger,
  items,
  align = "end",
  className,
}: {
  trigger: ReactNode;
  items: MenuItem[];
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <DropdownPrimitive.Root>
      <DropdownPrimitive.Trigger asChild>{trigger}</DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className={cn("ui-menu z-50 min-w-52 rounded-lg border border-border bg-surface p-1.5 shadow-lg outline-none", className)}
        >
          {items.map((item, index) =>
            item.separator ? (
              <DropdownPrimitive.Separator key={index} className="my-1.5 h-px bg-border" />
            ) : (
              <DropdownPrimitive.Item
                key={index}
                disabled={item.disabled}
                onSelect={() => item.onSelect?.()}
                className={cn(
                  "flex cursor-pointer select-none items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm outline-none transition-colors",
                  "data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                  item.danger ? "text-danger data-[highlighted]:bg-danger-soft" : "text-fg",
                  "[&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-current [&_svg]:opacity-70",
                )}
              >
                {item.icon}
                {item.label}
              </DropdownPrimitive.Item>
            ),
          )}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={250}>{children}</TooltipPrimitive.Provider>;
}

export function Tooltip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="ui-menu z-[60] max-w-64 rounded-sm bg-fg px-2.5 py-1.5 text-xs font-medium text-bg shadow-md"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
