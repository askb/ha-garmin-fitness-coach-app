"use client";

import { createContext, useCallback, useContext, useMemo } from "react";

const IngressContext = createContext("");

export function IngressProvider({ children }: { children: React.ReactNode }) {
  const basePath = useMemo(() => {
    if (typeof window === "undefined") return "";
    const match = /^(\/api\/hassio_ingress\/[^/]+)/.exec(
      window.location.pathname,
    );
    return match?.[1] ?? "";
  }, []);

  return (
    <IngressContext.Provider value={basePath}>
      {children}
    </IngressContext.Provider>
  );
}

export function useIngressPath() {
  return useContext(IngressContext);
}

export function useIngressHref() {
  const base = useIngressPath();
  return useCallback((path: string) => `${base}${path}`, [base]);
}

/** Non-hook helper for use in callbacks/event handlers */
export function getIngressUrl(path: string): string {
  if (typeof window === "undefined") return path;
  const match = /^(\/api\/hassio_ingress\/[^/]+)/.exec(
    window.location.pathname,
  );
  return match ? match[1] + path : path;
}
