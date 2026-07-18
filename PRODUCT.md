# Cadence — Product Context

## Register
product — app UI. Design serves the task: a delivery lead scanning sprint health and approving agent actions.

## Platform
web

## Users
- **Delivery Lead** (primary): connects the workspace, reads the forecast, approves Cadence's drafted actions, asks "why are we slipping?". Fluent in Linear/GitHub/Slack — expects that bar of familiarity.
- **Reviewer of a hiring take-home** (the real audience tonight): a founder watching a demo video. First impression decides.

## Purpose
Cadence is an Engineering Delivery Manager AI: it watches a repo + Projects board + Slack, forecasts sprint completion (RAG), and **acts** — labels, comments, reports, DMs. The dashboard is the record + control room: wizard to connect, overview to read risk, actions to approve, chat to interrogate.

## Scene (theme rationale)
An engineer's second monitor at 7pm, IDE and terminal dark beside it, checking whether the sprint will land before standing up for the day. Dark theme is the native habitat — terminal-adjacent, calm, zero glare.

## Brand personality
Calm expert. Precise, evidence-first, quietly confident — an EDM who never panics, always cites item numbers. Not playful, not enterprise-stiff.

## Anti-references
- Generic SaaS analytics dashboards (gradient hero metrics, purple-on-navy).
- Enterprise admin bloat (Jira-like chrome, endless toolbars).
- AI-tool glassmorphism/neon.

## Design principles
1. Evidence over decoration — every number traceable to an item.
2. The RAG state is the loudest thing on screen; everything else stays quiet.
3. Actions (approve/apply) always look consequential — never buried, never shouting.
4. Density where the data is (tables/lists), air where decisions happen.

## A11y
WCAG AA contrast on dark surfaces; full keyboard paths on approve/dismiss; visible focus.
