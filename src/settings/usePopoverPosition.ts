import { useState, useEffect, useLayoutEffect, useCallback, type RefObject, type CSSProperties } from "react";

export interface PopoverPositionOptions {
  open: boolean;
  align?: "left" | "right" | "stretch";
  offset?: number;
  maxHeightCap?: number;
  flip?: boolean;
}

export interface PopoverPositionResult {
  style: CSSProperties;
  placement: "top" | "bottom";
  portalRoot: HTMLElement | null;
  updatePosition: () => void;
}

export function usePopoverPosition(
  triggerRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  options: PopoverPositionOptions
): PopoverPositionResult {
  const { open, align = "right", offset = 6, maxHeightCap = 240, flip = true } = options;

  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [placement, setPlacement] = useState<"top" | "bottom">("bottom");
  const [style, setStyle] = useState<CSSProperties>({
    position: "absolute",
    visibility: "hidden",
    pointerEvents: "auto",
  });

  useEffect(() => {
    if (typeof document !== "undefined") {
      const el = document.getElementById("settings-portal-root") || document.body;
      setPortalRoot(el);
    }
  }, [open]);

  const updatePosition = useCallback(() => {
    if (!open || !triggerRef.current) return;

    const root = portalRoot || (typeof document !== "undefined" ? (document.getElementById("settings-portal-root") || document.body) : null);
    if (!root) return;

    const triggerEl = triggerRef.current;
    const container = (root.closest(".settings-container") as HTMLElement) || root;
    const containerRect = container.getBoundingClientRect();
    const triggerRect = triggerEl.getBoundingClientRect();

    // Calculate zoom scale inside .settings-container
    const zoom = container.offsetWidth > 0 ? containerRect.width / container.offsetWidth : 1;

    // Convert to container coordinates
    const containerWidth = container.offsetWidth || window.innerWidth;
    const containerHeight = container.offsetHeight || window.innerHeight;
    const triggerLeft = (triggerRect.left - containerRect.left) / zoom;
    const triggerTop = (triggerRect.top - containerRect.top) / zoom;
    const triggerWidth = triggerRect.width / zoom;
    const triggerHeight = triggerRect.height / zoom;

    const margin = 8;
    const titleBarHeight = 36;

    // Available space
    const spaceBelow = containerHeight - (triggerTop + triggerHeight) - margin;
    const spaceAbove = triggerTop - titleBarHeight - margin;

    const menuEl = menuRef.current;
    const menuHeight = menuEl ? menuEl.offsetHeight : 140;
    const menuWidth = menuEl ? menuEl.offsetWidth : triggerWidth;

    let nextPlacement: "top" | "bottom" = "bottom";
    if (
      flip &&
      spaceBelow < Math.min(menuHeight, maxHeightCap) &&
      spaceAbove > spaceBelow
    ) {
      nextPlacement = "top";
    }

    const availableVertical = nextPlacement === "top" ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(
      maxHeightCap,
      Math.max(60, availableVertical - offset)
    );

    let left = triggerLeft;
    let widthVal: number | string | undefined = undefined;
    let minWidthVal: number | string | undefined = triggerWidth;

    if (align === "stretch") {
      left = triggerLeft;
      widthVal = triggerWidth;
      minWidthVal = triggerWidth;
    } else if (align === "right") {
      left = triggerLeft + triggerWidth - menuWidth;
      const maxLeft = containerWidth - margin - menuWidth;
      const minLeft = margin;
      if (maxLeft >= minLeft) {
        left = Math.max(minLeft, Math.min(left, maxLeft));
      } else {
        left = minLeft;
      }
    } else {
      left = triggerLeft;
      const maxLeft = containerWidth - margin - menuWidth;
      const minLeft = margin;
      if (maxLeft >= minLeft) {
        left = Math.max(minLeft, Math.min(left, maxLeft));
      } else {
        left = minLeft;
      }
    }

    const nextStyle: CSSProperties = {
      position: "absolute",
      left: `${Math.round(left)}px`,
      maxHeight: `${Math.round(maxHeight)}px`,
      minWidth: minWidthVal !== undefined ? `${Math.round(minWidthVal as number)}px` : undefined,
      width: widthVal !== undefined ? `${Math.round(widthVal as number)}px` : undefined,
      pointerEvents: "auto",
      visibility: "visible",
      zIndex: 10000,
    };

    if (nextPlacement === "bottom") {
      nextStyle.top = `${Math.round(triggerTop + triggerHeight + offset)}px`;
      nextStyle.bottom = "auto";
    } else {
      nextStyle.bottom = `${Math.round(containerHeight - triggerTop + offset)}px`;
      nextStyle.top = "auto";
    }

    setPlacement(nextPlacement);
    setStyle(nextStyle);
  }, [open, portalRoot, align, offset, maxHeightCap, flip, triggerRef, menuRef]);

  useLayoutEffect(() => {
    if (open) {
      updatePosition();
    }
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const handleScroll = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        if (rect.bottom < 36 || rect.top > window.innerHeight) {
          setStyle((prev) => ({ ...prev, visibility: "hidden" }));
          return;
        }
      }
      updatePosition();
    };

    const handleResize = () => {
      updatePosition();
    };

    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [open, updatePosition, triggerRef]);

  useEffect(() => {
    if (!open || !menuRef.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      updatePosition();
    });
    ro.observe(menuRef.current);
    return () => ro.disconnect();
  }, [open, updatePosition, menuRef]);

  return {
    style,
    placement,
    portalRoot,
    updatePosition,
  };
}
