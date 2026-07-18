# Cadence — The 4 Phases

**High-level roadmap only.** Each phase gets its own planning/research/decision pass right before we build it — this doc says *what* and *in what order*, not *how*. The how is grounded per-phase against `DECISIONS.md`, `PRODUCT_FLOWS.md` (the product-experience contract: wizard, roles, identity map, autonomy dial, surface matrix), the LangChain Docs MCP, and live verification.

**Deadline:** midnight 2026-07-18. The phases are ordered so the graded property — **closed-loop action (notify → do)** — exists as early as possible and survives any time crunch.

---

## Phase 1 — Ground truth & the sprint model

**Goal:** a deterministic, LLM-free foundation: real seeded data in, one scored sprint model out.

**Scope**
- ✅ Seeded demo repo (`dagmfre/better-auth`): milestone, 10 issues (2 blocked, 3 closed), 5 PRs (1 draft, 1 real failing CI check), assignee load — *done*.
- ✅ Projects v2 board "better auth project" created, repo linked, issues auto-added — *done*.
- Verify the token can read the board via GraphQL (fine-grained + Projects permission, else classic-PAT fallback — DECISIONS §10); spread item Statuses across columns so the board signal varies.
- Freeze the sprint-model types: `DeliveryItem` (incl. `boardStatus`), `RiskFinding`, `Forecast`, `ActionPlan`.
- Ingest: 3 REST calls + check-runs + 1 GraphQL board query + reviewer-load rollup → one sprint model.
- Deterministic core: risk scoring (staleness vs threshold, blocked, failing CI, review pile-up, board stagnation) + forecast math (completion %, projected slip, RAG).

**Decide/research at phase start:** exact GraphQL query/mutation syntax; final risk-category list + scoring weights.

**Exit:** `pnpm scan` prints a correct scored sprint model from the live seeded repo — every seeded risk signal fires.

---

## Phase 2 — Agent pipeline & closed-loop actions ⭐ *the graded property* — ✅ DONE (verified live: Slack report + owner DM; GitHub writes exercised via approve flow)

**Goal:** the LangGraph pipeline reasons over the scored model and **acts on GitHub and Slack**.

**Scope**
- LangGraph.js `StateGraph`, 3 sequential nodes: risk+cause → forecast → action (Gemini `gemini-3.5-flash` per node, sequential with backoff for the 10–15 RPM free tier).
- **GitHub writes first:** auto-label `at-risk`/`blocked`, comment on stalled PRs — this is what turns "notify" into "do".
- Slack: daily delivery report + targeted DMs to owners of at-risk work.
- Fastify server with `/run-daily-scan` (the endpoint cron will hit) + `/scan` for on-demand.

**Decide/research at phase start:** pin `@langchain/langgraph` + `@langchain/google-genai` versions; pick ONE state syntax (`StateSchema` vs `Annotation.Root` — never mix) grounded via the LangChain Docs MCP; structured-output shape per node.

**Exit:** one command ingests → scores → reasons → **labels a real PR, comments on it, posts the Slack report**.

---

## Phase 3 — Approval queue & conversational agent — ✅ DONE (verified live in Slack: @Cadence Q&A in-thread + "do it" → real DM; web chat via /api/chat; convos persisted in Upstash)

**Goal:** the human-in-the-loop layer: drafted actions that survive restarts, and a Q&A agent that acts from its replies.

**Scope**
- Upstash Redis persistence under the **workspace key** (DECISIONS §11): credentials/config, pending/approved actions, run history, `thread_ts → context`, roster map.
- Approval flow governed by the **autonomy dial** (Observe/Copilot/Autopilot, DECISIONS §14): scan drafts actions → preview → Approve executes; Autopilot applies + logs.
- **Identity mapping** (DECISIONS §13): roster build (GitHub logins ↔ Slack members), email→name auto-match, manual override API; per-signal routing rules (author/reviewer/assignee/Lead/unmapped-fallback).
- Conversational agent as a **separate** small graph over the sprint model: answers "why are we slipping?" with item-level evidence, proposes an action, executes on confirmation — same agent behind Slack and web chat.
- Slack Socket Mode thread path (works without a public URL; needs the no-sleep host).

**Decide/research at phase start:** Redis key layout (workspace-scoped); conversational tool-calling shape; Socket Mode reconnect behavior on Koyeb.

**Exit:** a drafted action survives a server restart and executes on approve; a Slack thread question gets an evidence-backed answer that can trigger a real action; a nudge reaches the **mapped** Slack user (fallback mention if unmapped).

---

## Phase 4 — Frontend, deploy & submission — 🔶 dashboard ✅ built & visually verified (web/: wizard, overview, actions, chat, settings — "Night Shift" design, DESIGN.md); remaining: Koyeb deploy, cron, video, submit

**Goal:** the demoable surface + the proactive story + the package that gets submitted.

**Scope**
- React + Vite dashboard (shadcn/ui + Tailwind, DECISIONS §18): **Connect Wizard** (4 steps, PRODUCT_FLOWS §2 — GitHub **OAuth** (PAT fallback)/pick, Slack manifest+tokens, roster confirm, autonomy pick + first scan), sprint selector, risk list (reason, severity, root cause, recommended action), forecast/RAG, board-status view, pending-actions panel with Approve, chat panel, scan button, Settings (roster + autonomy). Functional over pretty; workspace access key gates the dashboard.
- Deploy to Koyeb (no card, no sleep); cron-job.org → `/run-daily-scan` daily.
- Fresh re-seed for a clean demo state; record the 4-beat video (problem → design → live UI demo **starting from the wizard as a brand-new dev** → code walkthrough); package code + solution doc + video; submit before midnight.

**Decide/research at phase start:** Koyeb build config for the pnpm monorepo; what the video shows live vs pre-seeded.
**Cut line inside this phase:** if the clock bites, wizard steps fall back to `.env` pre-fill (DECISIONS §12) — the demo story survives without wizard polish.

**Exit:** submitted to kidus@brain3.ai before the deadline.

**Status:** deployed to Koyeb; accounts + per-account workspace isolation, connect wizard, closed-loop actions, conversational agent (web + Slack) all live. Remaining: record + submit.

---

## Cross-phase rules

- **Cut order when time runs out:** frontend polish → conversational agent → **never the closed-loop GitHub writes**.
- **No credit card on any service** — assignment rule, already verified per DECISIONS.md.
- **Verification every step:** `pnpm run typecheck` + run it for real against the seeded repo. No test suite this sprint.
- **Rotate the exposed GitHub token immediately after submission.**
