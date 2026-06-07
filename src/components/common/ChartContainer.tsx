"use client";

import {
  cloneElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";

interface ChartContainerProps {
  height: number;
  children: ReactElement<{ width?: number; height?: number }>;
  className?: string;
}

/**
 * Recharts' ResponsiveContainer is unreliable under Next 15 + Turbopack —
 * it either fails to fire its first measurement (chart stays 0×0) or, when
 * given fixed numeric width/height, refuses to render the inner chart at all
 * and just logs a warning. We sidestep both by measuring the wrapper ourselves
 * and cloning the recharts root with explicit `width`/`height` props.
 */
export function ChartContainer({
  height,
  children,
  className,
}: ChartContainerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setWidth(w);
    };

    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: "100%", height, minWidth: 0 }}
    >
      {width > 0 ? cloneElement(children, { width, height }) : null}
    </div>
  );
}
