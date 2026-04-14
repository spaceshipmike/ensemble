import React, { useEffect, useRef, useState, useCallback } from "react";

interface SplitProps {
  left: React.ReactNode;
  right: React.ReactNode;
  /** Key used to persist the split ratio to localStorage. */
  storageKey?: string;
  /** Minimum width of either panel in pixels. */
  minPanelWidth?: number;
}

/**
 * Resizable two-panel split. Hairline divider, drag to resize, double-click
 * to reset to 50/50. Width ratio persists to localStorage.
 */
export function Split({
  left,
  right,
  storageKey = "ensemble.split.ratio",
  minPanelWidth = 320,
}: SplitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      const parsed = stored ? parseFloat(stored) : NaN;
      return Number.isFinite(parsed) && parsed > 0.1 && parsed < 0.9 ? parsed : 0.5;
    } catch {
      return 0.5;
    }
  });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, ratio.toString());
    } catch {
      // non-fatal
    }
  }, [ratio, storageKey]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      if (width <= 0) return;
      const raw = x / width;
      const minRatio = minPanelWidth / width;
      const maxRatio = 1 - minRatio;
      setRatio(Math.max(minRatio, Math.min(maxRatio, raw)));
    };

    const handleUp = () => setDragging(false);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, minPanelWidth]);

  const resetRatio = useCallback(() => setRatio(0.5), []);

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        flex: 1,
        minHeight: 0,
        width: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${ratio * 100}%`,
          minWidth: minPanelWidth,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {left}
      </div>
      <div
        onMouseDown={onMouseDown}
        onDoubleClick={resetRatio}
        role="separator"
        aria-orientation="vertical"
        style={{
          width: 1,
          background: "var(--hairline-strong)",
          cursor: "col-resize",
          position: "relative",
          flexShrink: 0,
        }}
      >
        {/* wider invisible hit area */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: -4,
            right: -4,
          }}
        />
      </div>
      <div
        style={{
          flex: 1,
          minWidth: minPanelWidth,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {right}
      </div>
    </div>
  );
}
