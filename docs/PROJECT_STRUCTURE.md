# Project structure

The frontend follows the source organization of [dennispassway/next-miguel](https://github.com/dennispassway/next-miguel/tree/2f64eff1c2a386cde3de5c112aae9ac9d3ec1718), adapted to this Next.js App Router application.

```text
algo-dashboard/
├── backend/                         # FastAPI service, engine, data and Python tests
├── docs/
│   └── PROJECT_STRUCTURE.md
├── public/                          # Static browser assets
├── src/
│   ├── app/                         # Next.js routes and layouts
│   │   ├── callback/
│   │   ├── finbaba/
│   │   ├── orb/
│   │   └── terminal/
│   ├── components/                  # Reusable views and UI
│   │   ├── index.ts                 # Component exports
│   │   └── terminal/
│   │       ├── context.tsx          # TerminalProvider, useTerminal and shared state
│   │       ├── RuleBuilder.tsx
│   │       ├── LightweightChart.tsx
│   │       ├── TerminalShell.tsx
│   │       ├── ui.tsx
│   │       └── index.ts
│   ├── utils/                       # Shared non-UI helpers
│   │   ├── api.ts                   # HTTP client, ApiError, API_BASE and WS_URL
│   │   ├── analytics.ts             # Analytics response types
│   │   ├── format.ts                # Currency, number and percentage formatting
│   │   ├── mock.ts                  # Existing demo fixtures and seed-price constants
│   │   ├── rules.ts                 # Rule parsing and descriptions
│   │   └── index.ts
│   ├── types/
│   │   └── index.ts                 # Shared domain types
│   ├── defaults.ts                  # Endpoint defaults, indicators and timeframes
│   └── index.ts                     # Public source exports
├── next.config.ts
├── tsconfig.json
└── package.json
```

## Mapping from the reference

| Miguel convention                               | This application                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| `src/components/`                               | Reusable components remain in `src/components/`.                         |
| `src/components/context.js`                     | Terminal state is colocated at `src/components/terminal/context.tsx`.    |
| `src/utils/`                                    | API, formatting, analytics types and rule helpers are consolidated here. |
| `src/defaults.js`                               | Typed application defaults are in `src/defaults.ts`.                     |
| `src/index.js` and component `index.js` exports | TypeScript entry files expose the source and components.                 |

Miguel is a styleguide-generation package: its command-line generator and package-publishing bridge are specific to that library. This project keeps its application-specific `src/app`, shared `src/types`, and Python `backend` folders. Its URLs and App Router page/layout conventions are unchanged.

## Imports

Use direct module imports inside the application so each dependency stays clear:

```tsx
import { useTerminal } from "@/components/terminal/context";
import { RuleBuilder } from "@/components/terminal/RuleBuilder";
import { api } from "@/utils/api";
import { inr } from "@/utils/format";
import { emptyRule } from "@/utils/rules";
import { STANDARD_TIMEFRAMES } from "@/defaults";
import type { Strategy } from "@/types";
```

`@/*` resolves to `src/*` through `tsconfig.json`. Route-specific CSS modules stay next to their pages. Shared helpers have a single implementation; the former `src/lib`, `src/context`, and `src/config` forwarding layers have been removed.

The shared API client supports abort signals. HTTP and WebSocket defaults are defined together in `src/defaults.ts`; `NEXT_PUBLIC_TERMINAL_WS_URL` and the existing `NEXT_PUBLIC_WS_URL` override remain supported.
