# Cadence — Design System v2 "Control Room"

> Supersedes v1 "Night Shift". v1 was structurally thin (no shell, no icon system, no chips,
> no avatars, no auth surfaces) and had a **semantic collision**: its amber brand accent
> competed with RAG-amber, so "at risk" and "this is a button" wore the same colour.
> v2 fixes that and raises the density/craft bar to a professional delivery tool.

**Register:** product. **Theme:** dark-only, cool graphite. **Colour strategy:** Restrained —
tinted cool neutrals + one cyan accent + a strictly-reserved semantic set.

---

## 1. The core rule: colour is reserved

Red / amber / green are **semantics only** — forecast RAG and finding severity. Nothing else
may use them. That forces the brand accent out of the warm band entirely.

**Brand accent = signal cyan.** Cool, instrument-like, unmistakably not a status. It carries
primary actions, current selection, focus rings, links, and the logo mark. Nothing else.

---

## 2. Tokens (OKLCH — source of truth, mirrored in `web/src/index.css`)

### Surfaces & ink (cool graphite, hue 260, near-zero chroma)
| Token | Value | Use |
|---|---|---|
| `--bg` | `oklch(0.165 0.009 260)` | app field, deepest layer |
| `--surface` | `oklch(0.205 0.011 260)` | cards, panels, top bar |
| `--surface-2` | `oklch(0.245 0.013 260)` | sidebar, inputs, hover fill |
| `--surface-3` | `oklch(0.285 0.014 260)` | active/pressed, chip backgrounds |
| `--border` | `oklch(0.32 0.014 260)` | hairlines, card edges |
| `--border-strong` | `oklch(0.42 0.016 260)` | input borders, dividers that must read |
| `--ink` | `oklch(0.96 0.003 260)` | primary text |
| `--ink-muted` | `oklch(0.74 0.010 260)` | secondary text — **AA on all surfaces** |
| `--ink-faint` | `oklch(0.62 0.010 260)` | meta/timestamps only, never body copy |

### Brand
| Token | Value | Use |
|---|---|---|
| `--primary` | `oklch(0.76 0.115 200)` | primary buttons, active nav, links, logo |
| `--primary-hover` | `oklch(0.82 0.115 200)` | hover |
| `--primary-ink` | `oklch(0.18 0.02 200)` | text/icon on a filled primary |
| `--primary-wash` | `oklch(0.30 0.045 200)` | selected-row tint, active nav fill |
| `--ring` | `= --primary` | focus ring, 2px offset 2px |

### Semantic (reserved — RAG + severity ONLY)
| Token | Value | Meaning |
|---|---|---|
| `--red` | `oklch(0.68 0.185 25)` | RAG red · high severity |
| `--amber` | `oklch(0.80 0.145 80)` | RAG amber · medium severity |
| `--green` | `oklch(0.74 0.145 150)` | RAG green · low severity · passing CI |
| `--red-wash` / `--amber-wash` / `--green-wash` | same hue, `L 0.28 C 0.05` | chip backgrounds only |

### Category chips (risk categories — informational, low-chroma)
Six hues at `L 0.30 C 0.045` (background) with text at `L 0.86 C 0.09`:
`violet 300` · `blue 250` · `teal 195` · `sand 70` · `rose 10` · `slate 260`.
Assigned per risk category, stable across renders. These are **not** status colours.

### Radius / elevation / motion
`--radius: 6px` (controls, chips) · `10px` (cards, panels) · `999px` (avatars, dots).
Elevation is **surface-step + hairline**, never a heavy drop shadow. One shadow only:
`0 1px 2px oklch(0 0 0 / 0.4)` on floating layers (popover, dialog, dropdown).
Motion: **150ms ease-out** for state, **200ms** for layer entry. Nothing else animates.

---

## 3. Typography

One family: **Inter** (`ui-sans-serif` fallback). Mono (`ui-monospace`) is reserved for
**item numbers, repo paths, code, timestamps** — it is a semantic signal that "this is an
identifier", never a style choice.

Fixed rem ramp (no fluid clamps in product UI):

| Step | Size / line | Use |
|---|---|---|
| `data-xs` | 11px / 16 · +0.02em · uppercase | sidebar section labels, table micro-labels |
| `xs` | 12px / 16 | meta, chips, timestamps, counts |
| `sm` | 13px / 18 | table cells, dense rows, nav items |
| `base` | 14px / 20 | body, form controls, card text |
| `md` | 16px / 22 · 500 | card titles, section headings |
| `lg` | 20px / 26 · 600 | page titles |
| `stat` | 30px / 32 · 600 · -0.02em | **the RAG percentage only** — one per screen |

Weights: 400 body · 500 emphasis/labels · 600 headings. No 700+.

---

## 4. Shell / layout

```
┌─ TOP BAR (56px, --surface, hairline bottom) ───────────────────────────┐
│ [◑ Cadence]  workspace ▾        ⌕ search      [Run scan] 🔔 ? [avatar▾]│
├──────────┬─────────────────────────────────────────────────────────────┤
│ SIDEBAR  │  CONTENT (max-w 1180px, px-7 py-6)                          │
│ 232px    │                                                             │
│ surface-2│                                                             │
│          │                                                             │
│ WORKSPACE│                                                             │
│  ◈ repo  │                                                             │
│          │                                                             │
│ DELIVERY │  ← uppercase data-xs section label, --ink-faint             │
│  ▣ Overview   (active: --primary-wash fill + 2px --primary left rail)  │
│  ✓ Actions  ⑶ ← count badge                                            │
│  ◇ Chat                                                                │
│ WORKSPACE│                                                             │
│  ⚙ Settings                                                            │
│          │                                                             │
│ ─────────│                                                             │
│ autonomy ▾  ← the dial lives at the sidebar foot, always visible       │
└──────────┴─────────────────────────────────────────────────────────────┘
```

- **Logo is a link to `/`** — mark + wordmark, hover lifts the mark to `--primary-hover`.
- Sidebar groups get uppercase `data-xs` labels (`DELIVERY`, `WORKSPACE`), every item has a
  16px icon, active item = `--primary-wash` fill + 2px `--primary` left rail + `--ink`.
- Count badges (pending actions) sit right-aligned in the nav item.
- Responsive: <1024px the sidebar collapses to a 56px icon rail; <768px it becomes a sheet.

---

## 5. The logo mark

Custom SVG, not a stock icon. **Three ascending bars + a leading beat dot** — reads as rhythm
(cadence) and delivery velocity. Square viewBox, works at 16px. Mark in `--primary`; the beat
dot is the only element allowed to pulse (2s, `prefers-reduced-motion` disables it).
Wordmark: Inter 600, 15px, `-0.01em`, `--ink`.

---

## 6. Component inventory

Everything standard comes from **shadcn/ui**; icons are **lucide-react** only, 16px in UI /
14px in dense rows, `1.5` stroke. Never mix icon sets. Never a bare emoji as an icon.

**Required states on every interactive component:** default · hover · focus-visible · active ·
disabled · loading. Ship none of them missing.

| Component | Spec |
|---|---|
| **Button** | primary (filled cyan), secondary (surface-2 + border), ghost, destructive. 32px default / 28px sm. Icon+label gap 6px. Loading = spinner replaces icon, label stays. |
| **RAG banner** *(signature)* | `stat` percentage in RAG colour + status word + dot; slip / days-left / velocity as a 3-up definition list; narrative capped at 65ch. One per screen. |
| **Risk card** | mono `#nn` + truncating title; severity dot + category chip; reason (body), root cause (`--ink-muted`), recommended action (prefixed "Next:"). Hover raises to `--surface-2`. Click → GitHub. |
| **Action preview card** *(signature)* | icon + verb + mono target; the **exact** text Cadence will post in a quoted block (`--bg` inset, left hairline); Approve (primary) / Dismiss (ghost). This is the most important card in the product. |
| **Chip** | 20px, radius 6, `xs`, tinted bg + light text. Category chips and CI status only. |
| **Avatar** | 24px circle, initials on a hue derived from the login hash; used for assignee/author/reviewer. Stacked with -6px overlap + "+N" for groups. |
| **Table** | 36px rows, `sm`, sticky header in `--surface-2`, zebra off, row hover `--surface-2`, numeric/mono columns right-aligned. |
| **Empty state** | icon (24px, `--ink-faint`) + one sentence of what goes here + the button that fills it. Never "No data". |
| **Skeleton** | matches the real block's geometry. No spinners inside content. |
| **Toast/notice** | inline `role="status"` strip under the page header, not a floating toast. |

---

## 7. Auth surfaces (new)

Centred card on `--bg`, max-width 400px, logo above the card, no sidebar/top bar.

- **Sign in** — email, password, "Sign in" (primary, full width), link to Register.
- **Register** — email, password (min 8, strength hint), "Create account", link to Sign in.
- Errors render **inline under the field** (`--red`), plus one summary line; never a modal.
- The account menu (top-bar avatar) holds: email (muted, non-interactive), Settings, **Sign out**.
- After register → straight into the Connect Wizard. After sign-in → last route or Overview.

---

## 8. Voice

Specific, calm, imperative. Buttons name their effect: "Approve & apply", "Run scan",
"Create account". Errors name the fix: "Slack rejected that token — it should start with `xoxb-`."
Empty states name the next move: "Nothing queued. Run a scan and drafted actions land here."
Never: "Oops", "Something went wrong", "No data available".

---

## 9. Bans (on top of impeccable's absolute bans)

- Any red/amber/green used non-semantically.
- Gradients, glow, glassmorphism, decorative blur.
- Drop shadows for hierarchy (use surface steps + hairlines).
- Emoji as UI iconography (Slack message copy is exempt).
- Nested cards; a card inside a card is always a layout failure.
- Spinners in place of content (use skeletons).
- Hover-only affordances — everything must be reachable by keyboard.
