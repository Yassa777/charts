"use client";
import { useEffect, useRef, useState } from "react";

/* Count-up score. Preserves sign + 2 decimals, easing from 0 to target on mount. */
export function ScoreNumber({ value }) {
  const initialValue = Number.isFinite(value) ? value : 0;
  const [display, setDisplay] = useState(initialValue);
  const displayRef = useRef(initialValue);
  const frame = useRef(null);

  useEffect(() => {
    const target = Number.isFinite(value) ? value : 0;
    const startValue = displayRef.current;

    if (startValue === target) {
      setDisplay(target);
      return;
    }

    const start = performance.now();
    const duration = 900;

    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = startValue + (target - startValue) * eased;
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => frame.current && cancelAnimationFrame(frame.current);
  }, [value]);

  return <div className="score-number">{display.toFixed(2)}</div>;
}
