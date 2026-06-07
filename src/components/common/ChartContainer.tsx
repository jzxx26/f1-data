"use client";

import { type ReactElement } from "react";
import { ResponsiveContainer } from "recharts";

interface ChartContainerProps {
  height: number;
  children: ReactElement;
  className?: string;
}

export function ChartContainer({
  height,
  children,
  className,
}: ChartContainerProps) {
  return (
    <div
      className={className}
      style={{ width: "100%", height, minWidth: 0 }}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}
