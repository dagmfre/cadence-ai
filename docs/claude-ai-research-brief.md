# Cadence — Research & Decisions Brief for Claude.ai

**From:** Dagmfre (with Claude Code doing the actual build)
**To:** Claude.ai — acting as the **architecture + research partner**
**Date:** 2026-07-17 · **Hard deadline:** midnight, 2026-07-18 (~30 hours from now)

---

## 0. Your job in this brief (read first)

You are **not** writing the app. Claude Code (with the LangChain Docs MCP) writes the app. Your job is the part you're best at right now: **search the live internet for the current (July 2026) state of the tools and free tiers, then make the major technical decisions** that everything else hangs off.

I need three things back from you:

1. **Confirm or correct my 4 worries** (Section 3). For each: "Confirmed" or "Corrected", plus the fix.
2. **Decide the 9 technical questions** (Section 4). For each: one concrete pick, a one-line why, and any **current version numbers / free-tier limits** you found (with the date they were true). Don't hedge into a menu — pick one primary and at most one fallback.
3. **A final "locked decisions" table** (Section 5 format) I can paste straight back to Claude Code as the build contract.

**Rules for your research:**
- **Search the web. Don't answer from memory.** Free tiers, model IDs, and API limits shift monthly — I need what's true *this week*, with the limit numbers.
- Every "no credit card required" claim must be **verified against a current source**, because the whole assignment fails if a service demands a card.
- Be concrete. "Use a serverless host" is useless. "Use Render free web tier, no card, sleeps after 15 min idle, cold start ~30s" is what I need.
- Where a decision has a real tradeoff, name the consequence in one line — don't bury it.

---

## 1. What Cadence is (compressed context)

Cadence is an **Engineering Delivery Manager (EDM) AI** — a hiring take-home. It watches one software team's one GitHub repo and one sprint, and instead of just reporting, it **acts**.

- **Ingest:** pull the current sprint from GitHub. Milestone = sprint (has a due date), issues = tasks, open PRs = active work, CI = health. Build one "sprint model".
- **Agent pipeline (LangGraph.js, Gemini per node):** `Risk + root-cause` → `Forecast` → `Action`.
  - Risk+cause: flag stalled PRs / blocked issues / review delays; explain *why*; recommend the next action.
  - Forecast: completion likelihood + projected slip in days + RAG (red/amber/green) status.
  - Action: draft GitHub writes (labels, comments) + a Slack report + per-owner Slack messages.
- **Deterministic core (plain TypeScript, no LLM):** the actual risk scoring + forecast math, so results are stable and explainable.
- **Closed-loop actions:** it writes back to GitHub (auto-label `at-risk`/`blocked`, comment on stalled PRs) and posts to Slack — not just notify.
- **Conversational:** ask "why are we slipping?" in Slack or the UI; it answers with evidence from the sprint model, then can **act from that reply**.
- **Frontend (React + Vite):** risk list w/ root cause + recommended action, forecast/RAG, an **approval queue** (preview a drafted action, click Approve to apply/send), chat panel, scan button.
- **Proactive:** a daily scheduled scan runs without a user, ingests, scores, and posts the report.

**The evaluator's bar (this is the whole game):** the reviewer already called v1 "basic" because it was a read→analyze→notify loop. The single most important property is **closed-loop action — turning "notify" into "do"**. Every scoping call is judged against that: if a feature doesn't make Cadence *do* something to GitHub or Slack, it's cuttable.

---

## 2. Hard constraints (non-negotiable)

- **~30 hours total**, and that includes building demo data, recording a video, and packaging. Real coding time is maybe 18–20 hours.
- **Free tier only, NO credit card**, on every single service. This is an explicit assignment rule and a scoring criterion.
- **TypeScript end to end.** Node backend, React frontend.
- **LangGraph.js + LangChain** for the agent pipeline. **Gemini** as the model (free AI Studio key).
- Already set up: **Slack workspace + app**, **Gemini API key**. Nothing else — no GCP project, no GitHub token yet, no demo repo, no host account.
- Deploy is wanted, but **the "GCP Cloud Run with no card" claim needs your verification** before I commit to it (see worry b).

---

## 3. My 4 worries — confirm or correct each

These are the things I think can blow the timeline or the demo. For each, I've written my proposed resolution. **Tell me if I'm right, and sharpen the fix.**

### Worry A — There is no demo data, and it's on the critical path
The whole demo depends on a GitHub repo that shows stalled PRs, a blocked issue, a failing CI run, a near-due milestone, and an overloaded reviewer. That repo doesn't exist. It needs a **scripted seeder** (Node + write token) that creates a milestone, a spread of issues, PRs of varied state, a failing check, and a deliberately overloaded reviewer — so every risk category and the reviewer-overload example light up.

**The gotcha I want you to solve:** GitHub's API **won't let you backdate** `created_at`. So a freshly-seeded PR is "0 days old" — I can't fake "stalled 3 days" at seed time. My proposed fix: **drive risk off signals I can actually control** (the `blocked` label, failing CI, draft status, missing/assigned reviewer, review-requested-but-no-review) plus **relative, tunable staleness thresholds** (e.g. "stale = older than N hours", set N low for the demo), rather than leaning on real multi-day age. Optionally seed the repo tonight and demo tomorrow so *some* ages are genuinely real.
→ **Confirm this is the right approach, and tell me the cleanest way to make "stalled" demoable on a fresh repo.**

### Worry B — Cloud Run may not actually honor "no credit card"
My understanding: GCP's always-free Cloud Run still requires a **billing account with a card attached** to the project, even if you never pay. The assignment says no card. That's a direct contradiction. My proposed fix: **pick a genuinely no-card host** (see Decision 1) and treat "Cloud Run" as not viable — but I need the submission's deploy story to stay credible.
→ **Verify the current (July 2026) truth: does Cloud Run / Cloud Functions / Cloud Scheduler require a card? If yes, this worry is Confirmed and Decision 1 + 2 replace them.**

### Worry C — In-memory state breaks the approval flow and the Slack thread reply
The spec says "in-memory is fine because scans are re-runnable." True for the *scan*, false for the *approval queue*: scan drafts an action → host scales to zero / restarts → user clicks Approve → the pending action is gone. Same for a Slack thread reply landing on a cold instance with no memory of the question. My proposed fix: a **small free, no-card persistent store** (Decision 3) for pending actions + minimal run/thread state, and **Slack Socket Mode** (Decision 6) so the thread path doesn't depend on a warm public endpoint.
→ **Confirm, and tell me the smallest persistence that survives a restart without a card.**

### Worry D — "Reviewer has 6 open reviews" isn't in the 3 planned REST calls
The spec's headline example ("PR stalled because its reviewer has 6 open reviews → reassign") is the proof that root-cause reasoning is real and not just a fancy prompt. But it needs a **reviewer-load rollup** across all open PRs (who is requested on how many), which the planned three calls (milestones, issues-by-milestone, open-PRs) don't compute. My proposed fix: **add a reviewer-load aggregation** derived from the open-PRs call (count `requested_reviewers` occurrences), so no extra heavy API cost.
→ **Confirm this is cheap and correct, and flag the exact field(s) to read.**

---

## 4. Technical decisions to research + decide

For each: **pick one primary + at most one fallback**, one-line why, and the **current limit/version numbers** you found.

### Decision 1 — Deploy host (no card, externally reachable, ideally stateful)
Assuming Cloud Run is out (worry B), what is the best **free, no-credit-card** host for a Node/TypeScript backend that (a) an external daily scheduler can hit over HTTPS, (b) stays reachable, (c) can keep a tiny persistent store or reach one? Evaluate current state of: **Render, Railway, Fly.io, Koyeb, Deno Deploy, Cloudflare Workers, Vercel functions**. For each viable one: card required? cold-start / sleep behavior? persistent disk or not? Recommend one primary + one fallback.

### Decision 2 — Daily trigger / scheduler (no card)
If Cloud Scheduler is out, what free no-card scheduler pings an HTTPS endpoint once a day? Evaluate: **cron-job.org, GitHub Actions scheduled workflow, Render Cron, Upstash QStash, host-native cron**. Note: the assignment specifically liked "Cloud Scheduler → Cloud Run", so I need an equally credible proactive-trigger story. Recommend one.

### Decision 3 — State persistence (no card)
Smallest free, no-card store for ~4 things: pending/approved actions, run history, Slack-thread↔question mapping, and (stretch) cross-run memory. Evaluate current free tiers: **Supabase Postgres, Neon Postgres, Turso/libSQL, Upstash Redis, Firestore, host-local SQLite on a persistent disk**. Which is simplest to wire from Node/TS with the least ops? Card required on any? Recommend one.

### Decision 4 — Gemini model + limits
Which **current Gemini model** (AI Studio free tier, July 2026) should the agent nodes use? I need: exact model ID for `@langchain/google-genai`, free-tier **RPM / RPD / TPM** limits, and confirmation that **structured/JSON output + tool/function calling work on the free tier**. Compare the latest Flash vs Pro for this 3-node reasoning workload (latency vs quality). Recommend one, and give the fallback model ID if I hit a rate limit mid-demo.

### Decision 5 — LangGraph.js pattern (high-level only)
Claude Code will ground the actual code against the **LangChain Docs MCP**, so keep this architectural, not line-level. Questions: for **3 sequential nodes** (risk → forecast → action), is a `StateGraph` the right call, or is a plain composed chain enough? Where should the **conversational agent** live — a node in the same graph, or a **separate graph/agent** sharing the sprint model? Flag any **recent breaking changes** in `@langchain/langgraph` (JS) and the current package version. Give the recommended state/annotation shape at a high level.

### Decision 6 — Slack integration shape
For (a) posting a daily report, (b) DMing at-risk owners, (c) answering "why are we slipping?" **in a thread and acting from the reply** — pick **Socket Mode vs Events API**. Socket Mode = websocket, works behind NAT / no public URL, survives a host with no stable public endpoint. Events API = needs a public HTTPS URL + retry handling. Given the host from Decision 1, which is safer for a 30-hour build? List the **exact bot scopes** needed (chat:write, im:write, channels, reactions, etc.) and how the thread-reply→action path works end to end.

### Decision 7 — GitHub ingest, reviewer-load, and write scopes
Confirm the concrete calls: milestones, issues-by-milestone, open PRs (with review state + age), **CI/check status** (Checks API vs commit Status API — which?), and the **reviewer-load rollup** (worry D). REST vs GraphQL — is GraphQL worth it to get PRs + reviewers + checks in fewer round trips, or keep REST via Octokit for speed of build? List the **fine-grained token scopes** needed for read + write (issues + PRs: labels and comments).

### Decision 8 — Demo data seeder (sanity-check the approach)
Sanity-check worry A's seeder plan: a Node script using the write token that creates a milestone (due in a few days), ~10 issues (mix of open/closed, some `blocked`, assignees spread), ~5 PRs (varied review state, one draft, one with a failing check, one with an overloaded reviewer), so **every risk category + the reviewer-overload example fire**. Confirm nothing in the GitHub API blocks this, and give the workaround for the no-backdating problem.

### Decision 9 — Repo/tooling shape (quick)
Quick picks: **Fastify vs Express** for the backend; **one repo (server + ui) vs two**; **pnpm vs npm**; anything else that saves hours. Optimize for build speed and a clean submission, not elegance.

---

## 5. What I want back (output contract)

1. **4 worries:** each marked **Confirmed / Corrected** + the sharpened fix.
2. **9 decisions:** each with **one pick + fallback + why + current numbers (dated)**.
3. **A "locked decisions" table** in exactly this shape so I can hand it to Claude Code:

| # | Decision | Pick | Fallback | Card? | Key limit / version (as of date) |
|---|----------|------|----------|-------|----------------------------------|
| 1 | Deploy host | … | … | No | … |
| … | … | … | … | … | … |

4. **A one-paragraph "biggest risk to the 30-hour timeline"** call — the single thing most likely to make me miss the deadline, and how to de-risk it in the first 2 hours.

Keep it tight and decisive. I'm not looking for options — I'm looking for a locked build contract I can start coding against immediately.
