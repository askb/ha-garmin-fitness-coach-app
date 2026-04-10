import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { cn } from "@acme/ui";
import { ThemeProvider, ThemeToggle } from "@acme/ui/theme";
import { Toaster } from "@acme/ui/toast";

import { env } from "~/env";
import { TRPCReactProvider } from "~/trpc/react";
import { HamburgerMenu } from "~/app/_components/hamburger-menu";
import { IngressProvider } from "~/app/_components/ingress-provider";

import "~/app/styles.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    env.VERCEL_ENV === "production"
      ? "https://pulsecoach.app"
      : "http://localhost:3000",
  ),
  title: "PulseCoach — Your Personal Training Coach",
  description:
    "WHOOP-like coaching app powered by your Garmin data. Daily readiness scores, personalized workouts, and smart training guidance.",
  openGraph: {
    title: "PulseCoach",
    description: "Daily readiness + personalized workouts from your Garmin data",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "bg-background text-foreground min-h-screen font-sans antialiased",
          geistSans.variable,
          geistMono.variable,
        )}
      >
        <ThemeProvider>
          <IngressProvider>
            <HamburgerMenu />
            <TRPCReactProvider>{props.children}</TRPCReactProvider>
          </IngressProvider>
          <div className="absolute right-4 bottom-4">
            <ThemeToggle />
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
