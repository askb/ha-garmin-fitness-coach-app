"use client";

import { usePathname } from "next/navigation";

import { cn } from "@acme/ui";

import { IngressLink as Link } from "./ingress-link";
import { useIngressPath } from "./ingress-provider";

const navItems = [
  { href: "/", label: "Today", icon: "🏠" },
  { href: "/trends", label: "Trends", icon: "📊" },
  { href: "/training", label: "Training", icon: "💪" },
  { href: "/vitals", label: "Vitals", icon: "🫁" },
  { href: "/sleep", label: "Sleep", icon: "🌙" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function BottomNav() {
  const pathname = usePathname();
  const ingressBase = useIngressPath();
  const strippedPathname = ingressBase
    ? pathname.replace(ingressBase, "") || "/"
    : pathname;

  return (
    <>
      {/* Spacer so the fixed nav never overlaps page content on mobile.
          Height matches the nav: 48px button + py-1 wrapper (8px) +
          safe-area-inset-bottom. Hidden on md+ where the nav is hidden. */}
      <div
        aria-hidden="true"
        className="h-[calc(3.5rem+env(safe-area-inset-bottom))] md:hidden"
      />
      <nav className="bg-card border-border fixed right-0 bottom-0 left-0 z-50 border-t pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around px-1 py-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? strippedPathname === "/"
                : strippedPathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={cn(
                  "flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-xs transition-colors",
                  isActive
                    ? "text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="text-lg" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="max-[379px]:hidden">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
