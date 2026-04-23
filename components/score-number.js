"use client";
import { useEffect, useRef, useState } from "react";

/* Count-up score. Preserves sign + 2 decimals, easing from 0 to target on mount. */
export function ScoreNumber({ value }) {
  const [display, setDisplay] = useState(0);
  const frame = useRef(null);

  useEffect(() => {
    const target = Number.isFinite(value) ? value : 0;
    const start = performance.now();
    const duration = 900;

    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(target * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => frame.current && cancelAnimationFrame(frame.current);
  }, [value]);

  return <div className="score-number">{display.toFixed(2)}</div>;
}
