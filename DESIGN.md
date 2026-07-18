# Cadence — Design System v1 "Night Shift"

Dark, terminal-adjacent control room for a delivery agent. Restrained color strategy: warm-tinted dark neutrals + one burnt-amber brand accent + the RAG semantic trio (the only place color raises its voice).

## Tokens (OKLCH, source of truth — mirrored into `web/src/index.css`)

| Role | Value | Notes |
|---|---|---|
| bg | `oklch(0.145 0.008 40)` | near-black, warm-tinted toward brand hue 40° |
| surface / card | `oklch(0.185 0.009 40)` | panels, cards |
| surface-2 | `oklch(0.225 0.010 40)` | hover, inset fields, sidebar |
| border | `oklch(0.28 0.012 40)` | hairlines |
| ink / foreground | `oklch(0.94 0.005 40)` | body text |
| muted-foreground | `oklch(0.68 0.010 40)` | secondary text (AA on bg/surface) |
| **primary (brand)** | `oklch(0.72 0.16 40)` | burnt amber — primary actions, selection, focus ring |
| primary-foreground | `oklch(0.15 0.01 40)` | text on amber |
| rag-red | `oklch(0.62 0.19 25)` | forecast red, high severity |
| rag-amber | `oklch(0.75 0.14 85)` | forecast amber, medium severity |
| rag-green | `oklch(0.72 0.15 150)` | forecast green, low/ok |
| destructive | same as rag-red | dismiss/undo |

Rules: accent = actions/selection/state only, never decoration. RAG colors appear as **text + small dot markers**, not colored pill backgrounds. Full borders only — no side-stripe accents. No gradients, no glass.

## Typography
One family: **Inter** (system-ui fallback), fixed rem scale, ratio ~1.2:
12 (data/labels) · 13 (dense table) · 14 (body/UI default) · 16 (section) · 20 (page title) · 28 (the single RAG % readout — the one large number allowed).
Mono (`ui-monospace`) confined to item numbers, code, and timestamps.

## Layout
- Shell: fixed left sidebar 220px (surface-2, nav + workspace status) · content max-w 1100px, px-6.
- Density: tables/lists run compact (py-2); decision zones (approve card, wizard steps) get 1.5–2× the air.
- Spacing scale: 4/8/12/16/24/32/48.

## Components (shadcn/ui on Tailwind v4)
shadcn primitives for everything standard: Button, Card, Badge, Input, Select, Table, Tabs, Dialog, Switch, Skeleton, Separator. Icons: **lucide-react** only.
Signature elements (the two allowed bespoke pieces):
1. **RAG banner** — Overview header: big % + colored status word + slip/days-left row.
2. **Action preview card** — pending queue: exact label/comment/DM text shown verbatim in a quoted block with Approve (primary) / Dismiss (ghost).

## Motion
150–200ms ease-out state transitions only (hover, expand, dialog). No page choreography. `prefers-reduced-motion` → instant.

## Voice
Calm, specific, evidence-first. Buttons say what they do ("Approve & apply", "Run scan"). Errors name the fix ("Slack rejected that token — check it starts with xoxb-").
