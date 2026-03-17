"use client";

import { createContext, useContext, useMemo } from "react";

const IngressContext = createContext("");

export function IngressProvider({ children }: { children: React.ReactNode }) {
  const basePath = useMemo(() => {
    if (typeof window === "undefined") return "";
    const match = window.location.pathname.match(
      /^(\/api\/hassio_ingress\/[^/]+)/,
    );
    return match ? match[1] : "";
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
  return (path: string) => `${base}${path}`;
}
