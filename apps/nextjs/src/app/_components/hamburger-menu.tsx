"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { cn } from "@acme/ui";

import { IngressLink as Link } from "./ingress-link";
import { useIngressPath } from "./ingress-provider";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const menuSections: NavSection[] = [
  {
    title: "Dashboard",
    items: [
      { href: "/", label: "Today", icon: "🏠" },
      { href: "/trends", label: "Trends", icon: "📊" },
      { href: "/sleep", label: "Sleep", icon: "🌙" },
    ],
  },
  {
    title: "Training",
    items: [
      { href: "/training", label: "Training Load", icon: "💪" },
      { href: "/zones", label: "HR Zones", icon: "📶" },
      { href: "/activities", label: "Activities", icon: "🏃" },
      { href: "/power", label: "Power", icon: "⚡" },
      { href: "/fitness", label: "Fitness", icon: "🏋️" },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { href: "/coach", label: "AI Coach", icon: "🤖" },
      { href: "/insights", label: "Insights", icon: "💡" },
      { href: "/correlations", label: "Correlations", icon: "🔗" },
    ],
  },
  {
    title: "Self-Tracking",
    items: [
      { href: "/journal", label: "Journal", icon: "📓" },
      { href: "/interventions", label: "Interventions", icon: "💊" },
      { href: "/validation", label: "Validation", icon: "📏" },
    ],
  },
  {
    title: "Tools",
    items: [
      { href: "/export", label: "Export", icon: "📤" },
      { href: "/team", label: "Team", icon: "👥" },
      { href: "/settings", label: "Settings", icon: "⚙️" },
    ],
  },
];

export function HamburgerMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const ingressBase = useIngressPath();
  const strippedPathname = ingressBase
    ? pathname.replace(ingressBase, "") || "/"
    : pathname;

  // Close menu on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Hamburger button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          "bg-card/80 border-border text-foreground fixed top-3 left-3 z-50 flex h-10 w-10 items-center justify-center rounded-lg border backdrop-blur-sm",
          "hover:bg-accent active:scale-95 transition-all",
        )}
        aria-label="Open navigation menu"
      >
        <span className="text-lg">☰</span>
      </button>

      {/* Dark overlay */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/50 transition-opacity duration-300",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      {/* Slide-out sidebar */}
      <nav
        className={cn(
          "bg-card border-border fixed top-0 left-0 z-50 flex h-full w-72 flex-col border-r transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Header */}
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <span className="text-foreground text-sm font-semibold">
            GarminCoach
          </span>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="text-muted-foreground hover:text-foreground flex h-8 w-8 items-center justify-center rounded-md transition-colors"
            aria-label="Close navigation menu"
          >
            <span className="text-lg">✕</span>
          </button>
        </div>

        {/* Scrollable menu content */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {menuSections.map((section) => (
            <div key={section.title} className="mb-4">
              <h3 className="text-muted-foreground mb-1 px-2 text-xs font-medium uppercase tracking-wider">
                {section.title}
              </h3>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive =
                    item.href === "/"
                      ? strippedPathname === "/"
                      : strippedPathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
                          isActive
                            ? "text-primary bg-primary/10 font-semibold"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <span className="text-base">{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
