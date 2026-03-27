"use client";

import Link from "next/link";

import { useIngressHref, useIngressPath } from "./ingress-provider";

export function IngressLink({
  href,
  prefetch: _prefetch,
  replace: _replace,
  scroll: _scroll,
  ...props
}: React.ComponentProps<typeof Link>) {
  const ingressHref = useIngressHref();
  const basePath = useIngressPath();
  const resolvedHref = typeof href === "string" ? ingressHref(href) : href;

  // Inside HA ingress, use plain <a> for full page navigation.
  // Next.js client-side routing can't resolve ingress-prefixed paths
  // (e.g. /api/hassio_ingress/<token>/) against the app's route tree → 404.
  if (basePath) {
    return (
      <a
        {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
        href={
          typeof resolvedHref === "string" ? resolvedHref : String(resolvedHref)
        }
      />
    );
  }

  // Outside ingress (dev mode), use Next.js Link for client-side navigation
  return <Link {...props} href={resolvedHref} />;
}
