"use client";
import { createContext, useContext, useState, useMemo } from "react";

const HoverCtx = createContext({ hovered: null, setHovered: () => {} });

export function HoverProvider({ children }) {
  const [hovered, setHovered] = useState(null);
  const value = useMemo(() => ({ hovered, setHovered }), [hovered]);
  return <HoverCtx.Provider value={value}>{children}</HoverCtx.Provider>;
}

export function useHover() {
  return useContext(HoverCtx);
}
