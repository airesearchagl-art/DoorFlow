# DoorFlow — Project Rules & Architecture

## Tech Stack
- **Framework**: React 18 + Vite 5 (TypeScript strict mode)
- **Styling**: TailwindCSS v3
- **Rendering**: SVG (inline, responsive) for door elevation blueprints
- **Icons**: lucide-react

## Architecture Constraints
- **Strict separation** between the Core Engineering Engine (`src/core/ventilationEngine.ts`) and all UI/visual code.
- The engine module must be pure TypeScript with zero React imports.
- All fluid-dynamics logic lives exclusively in `src/core/`.
- UI components live in `src/components/`.

## Building Physics Rules
| Rule | Value |
|------|-------|
| Min flow velocity | 2.0 m/s |
| Max flow velocity | 3.0 m/s |
| Louver / grille default opening rate | 35% (0.35) |
| Design boundary offset from door frame | 150 mm |

## Commands
```bash
npm run dev      # Start dev server (http://localhost:5173)
npm run build    # Production build
npm run lint     # ESLint check
npm run preview  # Preview production build
```

## Key Files
- `src/core/ventilationEngine.ts` — Deterministic fluid-dynamic engine (pure TS)
- `src/components/DoorCanvas.tsx`  — SVG blueprint viewport
- `src/components/ConfigPanel.tsx` — Left-pane parameter inputs
- `src/components/HUDTelemetry.tsx` — Right-pane real-time metrics
- `src/App.tsx`                    — Layout assembly
