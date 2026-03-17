"use client";

import Link from "next/link";
import { useIngressHref } from "./ingress-provider";

export function IngressLink({
  href,
  ...props
}: React.ComponentProps<typeof Link>) {
  const ingressHref = useIngressHref();
  const resolvedHref = typeof href === "string" ? ingressHref(href) : href;
  return <Link {...props} href={resolvedHref} />;
}
