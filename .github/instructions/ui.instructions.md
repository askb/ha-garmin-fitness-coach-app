<!--
SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
SPDX-License-Identifier: Apache-2.0
-->

---
applyTo: "apps/nextjs/**"
---

# Next.js App Instructions

## App Router Patterns

- All pages under `src/app/`
- Components in `src/app/_components/`
- 16+ routes: Dashboard, Training, Fitness, Activities, Sleep, etc.
- Uses Turbopack for development builds

## UI Components

- shadcn/ui components from `@acme/ui` package
- Tailwind CSS v4 for styling
- Recharts for all data visualization
- `info-button.tsx` pattern for chart tooltip explanations

## Data Fetching

- tRPC client configured in `src/trpc/`
- Use React Query patterns (useQuery, useMutation)
- Server components can use tRPC server caller
- Prefetch data in layouts for instant page loads

## Chart Guidelines

- Must handle 6+ years of historical data
- Use responsive containers for all charts
- Include info buttons explaining the sport science behind each chart
- Lazy-load chart components for performance

## Path Alias

- `~/` maps to `src/` (configured in tsconfig.json)
- Import from packages: `import { x } from "@acme/api"`
