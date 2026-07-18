# Claude Design — ready-to-paste prompts (Cadence v2 "Control Room")

How to use: open **claude.ai/design**, create/open the **Cadence Design System** project, and
paste **Prompt 0 first** (it sets the whole system). Then paste the screen prompts one at a
time — one screen per message gets far better results than asking for all five at once.

Bring the output back here and I'll implement it against the real API.

---

## Prompt 0 — System foundation (paste this first)

> I'm designing **Cadence**, an Engineering Delivery Manager AI. It watches a team's GitHub repo,
> Projects board and Slack, forecasts whether the sprint will land (RAG status), and then **takes
> action** — labels risky PRs, comments on stalled ones, posts a delivery report to Slack, DMs the
> owner. The dashboard is the control room where a delivery lead reads risk and approves those actions.
>
> **Register:** product UI (dense, professional, task-focused). The benchmark for polish and
> information density is Jira/Linear — but do **not** copy their palette or chrome. It must read as
> its own product.
>
> **Personality:** precise, calm, evidence-first. A senior engineering manager who read every PR and
> tells you the one thing to fix today. Never alarmist, never playful.
>
> **Theme:** dark only, cool graphite (not navy, not warm black).
>
> **The single most important colour rule:** red / amber / green are **reserved semantics** — they
> mean forecast status and risk severity, nothing else. So the brand accent must live outside that
> band. Use a **signal cyan** accent for primary actions, active navigation, links and focus rings.
>
> **Palette (OKLCH, use exactly):**
> - bg `oklch(0.165 0.009 260)` · surface `oklch(0.205 0.011 260)` · surface-2 `oklch(0.245 0.013 260)` · surface-3 `oklch(0.285 0.014 260)`
> - border `oklch(0.32 0.014 260)` · border-strong `oklch(0.42 0.016 260)`
> - ink `oklch(0.96 0.003 260)` · ink-muted `oklch(0.74 0.010 260)` · ink-faint `oklch(0.62 0.010 260)`
> - primary `oklch(0.76 0.115 200)` · primary-hover `oklch(0.82 0.115 200)` · primary-ink `oklch(0.18 0.02 200)` · primary-wash `oklch(0.30 0.045 200)`
> - red `oklch(0.68 0.185 25)` · amber `oklch(0.80 0.145 80)` · green `oklch(0.74 0.145 150)`
>
> **Type:** Inter only. 11/12/13/14/16/20px ramp, plus one 30px "stat" size used exactly once per
> screen (the RAG percentage). Monospace **only** for item numbers, repo paths and timestamps —
> it signals "identifier", it's not decoration. Weights 400/500/600, never heavier.
>
> **Elevation:** surface steps + 1px hairlines. No drop shadows for hierarchy, no gradients, no glow,
> no glassmorphism. Radius 6px controls, 10px cards.
>
> **Icons:** Lucide, 16px, 1.5 stroke, one set only, never emoji.
>
> Please produce the **foundation first**: colour ramp, type scale, spacing scale, and the core
> components — buttons (primary/secondary/ghost/destructive × default/hover/focus/disabled/loading),
> input, select, chip/badge, avatar (initials, and a stacked group), table row, empty state, skeleton,
> and an inline status notice. Show every state; I need this as a real component sheet.

---

## Prompt 1 — App shell + logo

> Design the **application shell** and the **logo**.
>
> **Logo:** a custom mark, not a stock icon — **three ascending bars with a leading "beat" dot**,
> reading as rhythm (cadence) and delivery velocity. Must survive at 16px. Mark in the cyan accent,
> wordmark "Cadence" in Inter 600 15px. Show it at 16/20/32px and as a favicon.
>
> **Top bar** (56px, surface, hairline bottom): clickable logo at left, workspace switcher
> (`dagmfre/better-auth ▾`), a search field, a primary "Run scan" button, a notification bell with a
> count badge, a help icon, and an avatar menu at the right.
>
> **Sidebar** (232px, surface-2): uppercase 11px section labels (`DELIVERY`, `WORKSPACE`) grouping
> nav items — Overview, Actions (with a count badge), Chat, Settings. Every item has a 16px icon.
> The active item gets a primary-wash fill plus a 2px cyan left rail. At the foot, an always-visible
> **autonomy dial** (Observe / Copilot / Autopilot) and the connected repo.
>
> Show: default, an item hovered, an item active, and the collapsed 56px icon-rail version for
> narrow screens.

---

## Prompt 2 — Overview (the main screen)

> Design the **Overview** screen — the delivery lead's first look each morning.
>
> Content, in priority order:
> 1. **Sprint header** — "Sprint 1 — Cadence Demo", repo (mono), due date, "4 closed / 6 open", and a
>    Rescan button.
> 2. **The RAG banner** — this is the one loud element on the page. A 30px percentage
>    (**26%**) in the RAG colour, the status word ("Off track") with a filled dot, then projected slip
>    (8d), days left (2.7d) and closed-last-7-days (4) as a compact 3-up. Then a 2–3 sentence
>    plain-language narrative explaining *why*, capped at 65 characters per line.
> 3. **Risks (17)** — a two-column grid of risk cards. Each card: mono item number + truncating
>    title; a severity dot (high=red / medium=amber / low=neutral) and a category chip
>    (`board-stagnation`, `failing-ci`, `review-bottleneck`, `blocked-issue`, `stalled-pr`,
>    `unassigned-at-risk`); the reason; the root cause in muted text; and a "Next:" recommended
>    action. Cards must handle a very long title without breaking the grid.
> 4. **Board** — five columns (Backlog / Ready / In progress / In review / Done) with counts.
> 5. **Open items table** — number (mono, links out), title, type chip (issue / PR / draft PR), CI
>    status (passing green / failing red / — ), board column, and assignee avatars.
>
> Also show the **loading (skeleton)** state and the **empty** state ("No risks detected").

---

## Prompt 3 — Actions (the most important interaction)

> Design the **Actions** screen. This is where the human approves what the AI wants to do, so the
> approve control must feel consequential and the proposed text must be fully visible — never truncated.
>
> - **Awaiting approval** — a list of action cards. Each shows an icon + verb + mono target
>   ("Comment on #12", "DM @dagmfre", "Label #7"), then **the exact text Cadence will post**, in a
>   quoted inset block. Actions: "Approve & apply" (primary) and "Dismiss" (ghost).
> - **Run history** — collapsible rows: timestamp (mono), trigger chip (manual/daily), the RAG result,
>   finding count; expanded shows the applied-actions log and the full Slack report that was posted.
> - A prominent "Run scan now" button, and its running state.
>
> Show: the populated state, the empty state, a card mid-apply (loading), and a failure state where
> one action errored.

---

## Prompt 4 — Chat, Wizard, and Auth

> Three related surfaces:
>
> **A. Chat** — asking Cadence about the sprint. Assistant messages are cards on surface, user
> messages are right-aligned on surface-2, max 75ch. Critically: when Cadence proposes an action, it
> renders a **proposal card** below its message — showing the action and a "Do it" button — because the
> user can execute from the conversation. Show the empty state with 3 suggested questions, a thinking
> state, and a proposal that has already been applied.
>
> **B. Connect Wizard** — 4 steps (GitHub → Slack → Team → Autonomy) with a segmented progress
> indicator. Step 1: "Sign in with GitHub" primary button plus an "advanced: paste a token" fallback,
> then repo and board pickers. Step 3 is the interesting one: a **roster table** matching GitHub
> logins to Slack members, each row showing a confidence level (high / medium / unmatched) with a
> dropdown to correct it. Step 4: pick Observe / Copilot / Autopilot as three selectable cards, then
> "Finish & run first scan" with a live progress state.
>
> **C. Auth** — Sign in and Register. Centred 400px card on the app background, logo above it, no
> shell. Email + password; register adds a password-strength hint. Show inline field-level error
> states. Also design the top-bar **account dropdown**: email, Settings, Sign out.

---

## What to bring back

Ask Claude Design to export the component sheet + screens. Paste the HTML/CSS or the tokens back
into this repo's chat and I'll wire them to the live API (`/api/scan`, `/api/pending`,
`/api/approve/:id`, `/api/chat`, `/api/auth/*`).
