"use client";

import { usePathname } from "next/navigation";

import { cn } from "@acme/ui";

import { IngressLink as Link } from "./ingress-link";
import { useIngressPath } from "./ingress-provider";

const navItems = [
  { href: "/", label: "Today", icon: "🏠" },
  { href: "/trends", label: "Trends", icon: "📊" },
  { href: "/training", label: "Training", icon: "💪" },
  { href: "/hrv", label: "HRV", icon: "💓" },
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
    <nav className="bg-card border-border fixed right-0 bottom-0 left-0 z-50 border-t">
      <div className="mx-auto flex max-w-md items-center justify-around py-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? strippedPathname === "/"
              : strippedPathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg px-4 py-1.5 text-xs transition-colors",
                isActive
                  ? "text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
