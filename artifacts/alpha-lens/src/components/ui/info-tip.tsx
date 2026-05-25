import * as React from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Tap-friendly tooltip. Native HTML `title=""` tooltips don't show on
 * touch devices (no hover), so any explanation we want mobile users to
 * see has to live inside something they can tap. InfoTip renders its
 * trigger as a real `<button>` (via PopoverTrigger's default) so it's
 * focusable, keyboard-accessible, AND opens on tap. On desktop the
 * popover still opens on click; we mirror the label into the native
 * `title` attribute so desktop hover users see something too.
 *
 * Pass `className` to style the trigger button itself (it sits in the
 * normal flow where the original element was, so you typically want the
 * same layout/visual classes the original wrapper used). Pass
 * `contentClassName` to override the popover bubble width/spacing if the
 * default `max-w-xs` is too tight for long copy.
 */
export interface InfoTipProps {
  label: React.ReactNode;
  /** Plain-text version of `label` used for the trigger's native title
   *  attribute (desktop hover fallback). Defaults to label when it's a
   *  string. */
  titleText?: string;
  className?: string;
  contentClassName?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** When InfoTip is nested inside another clickable element (e.g. a
   *  briefing card whose parent toggles expansion on click), set this
   *  to true so the trigger calls stopPropagation on click/keydown and
   *  the host element doesn't react to the tap as well. */
  stopPropagation?: boolean;
  children: React.ReactNode;
}

export function InfoTip({
  label,
  titleText,
  className,
  contentClassName,
  side,
  align,
  stopPropagation,
  children,
}: InfoTipProps) {
  const fallbackTitle =
    titleText ?? (typeof label === "string" ? label : undefined);
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        title={fallbackTitle}
        onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
        onKeyDown={
          stopPropagation
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") e.stopPropagation();
              }
            : undefined
        }
        className={cn(
          "cursor-help text-left bg-transparent border-0 p-0 m-0 font-inherit text-inherit",
          className,
        )}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className={cn(
          "w-auto max-w-xs text-xs leading-snug font-normal",
          contentClassName,
        )}
      >
        {label}
      </PopoverContent>
    </Popover>
  );
}
