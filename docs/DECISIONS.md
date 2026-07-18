# Cadence — Locked Build Decisions

**Project:** Cadence — Engineering Delivery Manager AI (hiring take-home)
**Owner:** Dagmfre · **Builder:** Claude Code · **Research/architecture:** Claude.ai
**Deadline:** midnight 2026-07-18
**All facts verified against live sources on 2026-07-17.**

This is the build contract. Where a decision names a version or limit, treat it as a constraint, not a suggestion. Two hard rules run through everything:

1. **No credit card on any service.** It's an explicit assignment rule and a scoring criterion. Every service below is verified no-card.
2. **The graded property is closed-loop action** — Cadence must *do* things to GitHub and Slack, not just report. If a feature doesn't make it act, it's cuttable.

---

## Locked decisions (quick reference)

| # | Decision | Pick | Fallback | Card? | Key limit / version (as of 2026-07-17) |
|---|----------|------|----------|-------|----------------------------------|
| 1 | Deploy host | Koyeb | Render | No | Koyeb: no sleep, ~0.1 vCPU free. Render: sleeps 15min, 30-60s cold, no disk |
| 2 | Daily trigger | cron-job.org | GitHub Actions cron | No | cron-job.org: unlimited, <1min drift. GH cron: delayed/skips in 2026 |
| 3 | State store | Upstash Redis | Neon Postgres | No | Upstash: 500K cmds/mo, 256MB. Neon: 0.5GB/project, never expires |
| 4 | LLM (agents) | gemini-2.5-flash | gemini-3.1-flash-lite | No | ~15 RPM / 1,500 RPD / 1M TPM free; function-calling + JSON on free tier. Pro is paid-only |
| 5 | Agent pattern | StateGraph, 3 sequential nodes | — | — | Conversational = separate graph. PIN langgraph; don't mix StateSchema vs Annotation.Root |
| 6 | Slack | Socket Mode | Events API + keep-alive | No | Needs no-sleep host (Koyeb). Scopes below |
| 7 | GitHub ingest | REST (Octokit) + Checks API | GraphQL | No | Token perms below |
| 8 | Demo seeder | Node + write token | — | No | Real failing Actions check; low staleness thresholds; can't backdate |
| 9 | Tooling | Fastify · single repo · pnpm | Express | — | 2 folders (/server, /web) |
| 10 | Board signal | GitHub Projects v2 (GraphQL via `octokit.graphql`) | Milestones-only | No | Classic is DEAD (sunset 2024-08-23, 410). Token needs Projects permission — see §10 |
| 11 | Product model | Workspace-based (one team's repo+board+Slack+roster under one Redis key) | — | No | Demo = 1 workspace; architecture supports N. See PRODUCT_FLOWS.md §0 |
| 12 | Onboarding | 4-step Connect Wizard, BYO tokens (validate → discover → pick) + Slack app manifest | .env-prefilled fallback if clock bites | No | OAuth/GitHub App = documented upgrade path, not built. PRODUCT_FLOWS.md §2 |
| 13 | Identity map | Auto-match GitHub↔Slack (email → name → manual fix in wizard) + routing rules | channel @mention fallback for unmapped | No | Needs Slack `users:read.email` scope. PRODUCT_FLOWS.md §4 |
| 14 | Autonomy | Per-workspace dial: Observe / Copilot (default) / Autopilot | — | No | Checked before every outbound action, incl. cron runs. PRODUCT_FLOWS.md §5 |
| 15 | Conversations | One `Conversation` shape, Redis `ws:{id}:convo:{convoId}`; web = persistent convo, Slack = per-thread (`convoId=thread_ts`) | — | No | Same agent + storage behind both surfaces |
| 16 | GitHub auth | OAuth web flow (scopes `repo project read:user user:email`) | PAT paste in same wizard step | No | OAuth App clickops; PAT fallback keeps the demo alive |
| 17 | Sprint scoping | Per-sprint (milestone = sprint); dashboard sprint selector, default = nearest-due open | — | No | Risks/forecast/board/report/chat all sprint-scoped |
| 18 | Dashboard stack | shadcn/ui + Tailwind on Vite, dark modern | — | No | Nav: Overview · Actions · Chat · Settings |
| 19 | LLM grounding | Deterministic model injected + tools: risk node gets `get_item_timeline`; convo agent fully tool-calling | — | No | `get_sprint_model/get_item/get_reviewer_load/draft_action/execute_action` |

---

## Coupled decisions (read before building)

Two pairs are linked. Don't change one without the other:

- **Host (1) ↔ Slack (6).** Socket Mode holds a websocket, so it needs a host that doesn't sleep. Koyeb (no sleep) enables Socket Mode. If you drop to Render (sleeps), the socket dies on idle and you must switch to Events API + a keep-alive pinger. Koyeb + Socket Mode is the coherent primary.
- **Host (1) ↔ State (3).** No free host here gives a persistent disk, so state must be external. Upstash Redis over HTTP survives host restarts and scale-to-zero. This is what makes the approval queue and thread context safe.

---

## The 4 worries — resolved

### A. No demo data, and GitHub won't let you backdate — CONFIRMED
The public API can't set `created_at` on issues/PRs, so don't drive risk off real age. Drive it off signals you control at seed time:
- `blocked` label
- draft PR status
- a **real** failing GitHub Actions check (commit whose workflow exits non-zero → `conclusion: failure`)
- `requested_reviewers` present with no submitted review
- board status stagnation — a Projects v2 item parked in "In progress"/"In review" (Status is fully controllable at seed time, decision #10)
- **relative, tunable staleness:** `stale = updated_at older than N`; set N to minutes/hours for the demo so fresh items already read as stale.

### B. Cloud Run "no card" — CONFIRMED, Cloud Run is out
GCP requires a card at signup even for Always Free (identity verification, not a charge). That fails the "no card" rule. Decisions 1 + 2 replace Cloud Run + Cloud Scheduler.

### C. In-memory breaks approval + thread reply — CONFIRMED
Scans are re-runnable; pending actions and thread question-context are not. Fix: Upstash Redis (Decision 3) for pending/approved actions, run history, and `thread_ts → context`. Plus Socket Mode (Decision 6) so the thread path doesn't need a warm public URL.

### D. Reviewer-load isn't in the 3 calls — CONFIRMED, and it's cheap
No extra API cost. The list-open-PRs call returns `requested_reviewers` per PR. Count occurrences per user across open PRs = the load rollup. Nuance: `requested_reviewers` only lists reviewers who haven't submitted yet, which is exactly "pending reviews" — ideal for the seeded demo.

---

## The 9 decisions — detail

### 1. Deploy host → Koyeb (primary), Render (fallback)
Koyeb: no card, **no sleep** (container runs continuously), which the Socket Mode websocket and approval queue need. Free tier is lightweight (~0.1 vCPU) but enough. Koyeb was acquired by Mistral AI in Feb 2026; free-tier commitment unchanged.
Render fallback: no card, but sleeps after 15 min with a 30-60s cold start and no persistent disk on free — which breaks a persistent websocket.
**Out:** Fly.io (now requires a card, no new-user free tier), Railway (limited one-time credits, not a real free tier).

### 2. Daily trigger → cron-job.org (primary), GitHub Actions cron (fallback)
cron-job.org is the exact analog to "Cloud Scheduler → endpoint": free, no card, unlimited jobs, pings your HTTPS `/run-daily-scan`, <1 min drift. GitHub Actions cron is repo-native and free on public repos but its scheduled-workflow delays worsened through 2026 and it skips runs on inactive repos; add `workflow_dispatch` if you use it.
**Demo:** hit `/run-daily-scan` manually — don't wait on real cron during the video.

### 3. State store → Upstash Redis (primary), Neon Postgres (fallback)
Upstash: no card, HTTP (no connection pooling), trivial from Node, KV matches the access pattern. Free: 500K commands/month, 256MB. Stores: pending/approved actions, run history, `thread_ts → question context`, (stretch) cross-run memory.
Neon fallback if you want relational queries: 0.5 GB/project, no card, never expires. Turso (5 GB, libSQL/SQLite) also fine.

### 4. Gemini model → gemini-3.5-flash (primary), gemini-2.5-flash (fallback)
3.5 Flash is GA and stable (verified 2026-07-18): sustained frontier-level intelligence at Flash speed/cost, function calling + JSON mode + 1M context on the free tier at ~15 RPM / 1,500 RPD / 1M TPM, no card. Both structured output and tool-calling work on free. Pin via `GEMINI_MODEL` env if you need to fall back to 2.5-flash when limits bite.
- Pro models are paid-only since ~April 2026 — do not design around Pro.
- **Dead:** `gemini-2.0-flash` / `2.0-flash-lite` were shut down June 1, 2026 — don't let it default there.
- **Live-demo risk:** 10-15 RPM. Run nodes sequentially with small backoff so a burst doesn't 429.
- Package: `@langchain/google-genai` (pin the version).

### 5. Agent pattern → single StateGraph, 3 sequential nodes; conversational agent as a separate graph
Nodes: `risk+cause → forecast → action`. Sequential `StateGraph` with typed state channels — not a plain chain, because state flows between nodes. Keep the conversational Q&A as its own small graph/agent that reads the same sprint model from Upstash; it's a different interaction mode (interrupt-driven, tool-calling), don't bolt it onto the linear pipeline.
**Version trap:** current `@langchain/langgraph` JS docs show two state APIs side by side — the newer `StateSchema` / `MessagesValue` / `GraphNode` syntax and the older `Annotation.Root`. Mixing them is the version-blend bug. **Pin one `@langchain/langgraph` version, pick one syntax, and ground every state snippet against the LangChain Docs MCP for that pinned version.**

### 6. Slack → Socket Mode (primary), Events API + keep-alive (fallback)
Socket Mode = websocket, no public URL, survives NAT — needs the no-sleep host (Koyeb). On a sleeping host the socket drops, forcing Events API + keep-alive.
Core bot scopes:
- `chat:write` — post the report
- `im:write` + `users:read` — DM at-risk owners
- `app_mentions:read` + `channels:history` (or `im:history`) — receive the "why are we slipping?" question
Thread-reply → action flow:
1. User asks in-thread (mention or DM) → event over the socket → backend handler
2. Backend loads sprint model from Upstash
3. Conversational agent answers with evidence, replies in-thread (`thread_ts`), proposes an action
4. User confirms ("do it" / ✅) → backend executes the GitHub/Slack write → confirms in-thread
5. `thread_ts → context` stored in Upstash so a cold instance keeps context

### 7. GitHub ingest → REST via Octokit; Checks API for CI
Keep REST for build speed — for one repo/one sprint the round trips are negligible and the reviewer rollup is a client-side count. Skip GraphQL (costs build time).
Calls: milestones; issues by milestone; open PRs (review state + `requested_reviewers` + head SHA); then per PR head SHA `GET /repos/{owner}/{repo}/commits/{ref}/check-runs` for CI. Use the **Checks API** (what GitHub Actions writes), not the legacy commit Status API.
A 4th read joins the three REST calls: the **Projects v2 board-status query** (one GraphQL call, decision #10) mapping each issue/PR to its board Status.
Fine-grained token permissions on the one repo:
- **Agent ingest (read path):** Metadata R, Contents R, Issues R+W (labels + comments), Pull requests R+W, Checks R.
- **Demo seeder (write path, superset):** also needs **Contents: Read+Write** (commits + branches) and **Workflows: Write** (GitHub blocks pushing `.github/workflows/*` without it). Verified 2026-07-17: a read-only-Contents token 403s on the seeder's first write.

### 8. Demo seeder → Node + write token (viable)
Creates: one milestone (due in a few days); ~10 issues (mixed open/closed, a couple `blocked`, assignees spread); ~5 PRs (one draft, one with a real failing Actions check, one with 4-6 `requested_reviewers` on one user). Nothing in the API blocks this. Only wall is backdating (Worry A) — solved by controllable signals + low staleness thresholds. Make the failing check real: push a commit whose Actions workflow exits non-zero so `check-runs` returns a true `failure`.

### 9. Tooling → Fastify, single repo, pnpm
Fastify over Express: native TS types, less boilerplate, built-in schema validation for the API. One repo, two folders (`/server`, `/web`). pnpm for speed. Optimize for a clean walkthrough, not elegance.

### 10. Board signal → GitHub Projects v2 (GraphQL), additive enrichment
*Added 2026-07-17 after verifying Projects (classic) is dead.*

**Projects (classic) is rejected — the API no longer exists.** GitHub sunset Projects (classic) on **2024-08-23** ([changelog](https://github.blog/changelog/2024-05-23-sunset-notice-projects-classic/)); its REST endpoints (`/repos/{owner}/{repo}/projects`, columns, cards) return `410 Gone`, and classic was fully removed from GHES in v3.17 (June 2025). `docs/PROJECTS_CLASSIC_WITH_OCTOKIT_REST.md` predates the sunset — reference only, never build against it.

**What we use instead:** the live **Projects v2 API — GraphQL only** — via `octokit.graphql` on the same Octokit instance.

**Framing: additive enrichment.** The milestone stays the sprint boundary (dates, scope, velocity — as the approved solution doc says). The board's **Status** single-select field (Backlog / Ready / In progress / In review / Done) adds per-task board state: `DeliveryItem` gains `boardStatus`. New risk signal: status stagnation (parked in "In progress"/"In review" past the staleness threshold) and status/reality mismatch (e.g. PR merged but item not in Done).

**Board already exists** (created by hand 2026-07-17): user-owned project **"better auth project"** under `dagmfre`, linked to `dagmfre/better-auth`, default template columns, 7 seeded issues auto-added to Backlog by the board's built-in workflows. Remaining build work: spread Statuses across columns (seeder), read them (ingest).

**API shape (high level, ground exact syntax at build time):**
- Read: `user(login:"dagmfre") → projectV2(number:N) → items(first:100) → { content { …on Issue { number } …on PullRequest { number } }, fieldValueByName(name:"Status") { …on ProjectV2ItemFieldSingleSelectValue { name } } }`
- Write (seeder/actions): `updateProjectV2ItemFieldValue` mutation with the project/item/field/option IDs.

**Token caveat (verify before building Phase 1):** Projects v2 GraphQL requires either the current fine-grained PAT upgraded with the **account-level "Projects" permission** (fine-grained GraphQL support is recent — test it with the read query first) or, as fallback, a **classic PAT with `project` + `repo` scopes** used only by the board reader/seeder. The existing token has neither today. *Update 2026-07-18: user created the classic PAT (`project` + `repo`) — must land in `.env` and be verified with the board read query before Phase 1 ingest work.*

### 11–14. Product model → workspace + connect wizard + identity map + autonomy dial
*Added 2026-07-18 — the product-experience layer. Full contract: `PRODUCT_FLOWS.md`; this section only locks the picks.*

- **11 · Workspace model.** All per-team state (credentials, repo/board choice, roster map, runs, pending actions, thread contexts) lives under one workspace key in Upstash Redis. One workspace in the demo; N by design. Two roles only: **Delivery Lead** (connects, approves, dashboard via a once-shown workspace access key) and **Team Member** (no login — reached via Slack/GitHub).
- **12 · Onboarding = BYO-token Connect Wizard** (GitHub PAT → validate → pick repo/board; Slack via pre-configured **app manifest** → validate → pick channel; roster confirm; autonomy pick; first scan live). OAuth/GitHub-App install is the *documented* production upgrade — same wizard shape, swapped credential step. Escape hatch if the clock bites: wizard steps pre-fillable from `.env` so the demo never blocks on UI polish.
- **13 · Identity mapping** is a first-class workspace object: auto-match (email exact → normalized name → flag unmatched) with human confirmation in the wizard, editable in Settings; per-signal routing rules (author ← PR stalls, reviewer ← review bottlenecks, assignee ← blocked/stale, Delivery Lead ← escalations, unmapped → graceful channel mention, never dropped).
- **14 · Autonomy dial** per workspace: **Observe** (draft only) / **Copilot** (draft → approve; default) / **Autopilot** (act + log). One check in the action executor covers every path including cron.

### 15–19. Conversations · OAuth · sprint scoping · dashboard · LLM grounding
*Added 2026-07-18 (endgame decisions).*

- **15 · Conversations:** unified record `ws:{id}:convo:{convoId}` → `{surface, messages[{role, text, ts, evidence?, proposedAction?}]}`. Web chat = a persistent workspace conversation; Slack = one conversation per thread (`convoId = thread_ts`). One conversational agent reads/writes both.
- **16 · GitHub auth:** OAuth web flow is primary (`GET /auth/github` → GitHub → `GET /auth/github/callback` code-for-token; scopes `repo project read:user user:email`; token stored on the workspace). The PAT paste input remains in the same wizard step as the fallback — the demo must never die on a callback. Slack stays manifest+paste (its OAuth needs public-URL app config — production upgrade).
- **17 · Sprint scoping:** everything is per-sprint. Sprint = milestone (due date, open/closed counts). Default sprint = nearest-due open milestone; the dashboard has a sprint selector; the Slack report, risk list, forecast, board view, and chat evidence are all scoped to the selected sprint.
- **18 · Dashboard:** shadcn/ui + Tailwind (dark). Left nav Overview/Actions/Chat/Settings; Overview = sprint header (RAG, completion %, slip, days left, velocity) + risk cards + board summary + items table.
- **19 · LLM grounding:** deterministic outputs are injected as structured facts (the LLM explains, never overrides the numbers). Dynamic grounding via tools: pipeline risk node may call `get_item_timeline` (REST events/comments) for root-cause evidence; the conversational agent is fully tool-calling (`get_sprint_model`, `get_item`, `get_reviewer_load`, `draft_action`, `execute_action` — execute honors the autonomy dial).

---

## Free-tier verification checklist (do before coding)

- [ ] Koyeb account created — no card asked
- [ ] Upstash Redis DB created — no card, REST URL + token in hand
- [ ] Gemini key confirms `gemini-3.5-flash` responds (fall back to `gemini-2.5-flash` via GEMINI_MODEL if limits bite)
- [ ] GitHub fine-grained token scoped to the demo repo, with WRITE perms for seeding: Metadata R, Contents R+W, Issues R+W, Pull requests R+W, Workflows W, Checks R
- [ ] cron-job.org account created — no card
- [ ] Slack app: Socket Mode enabled, app token + bot token, scopes above

---

## Biggest risk to the timeline

The **demo-data seeder is the critical path**, not the agent. Everything the reviewer sees depends on a repo that visibly triggers every risk category, and you can't fake age. Build and tune the seeder in the first 2 hours — including a real failing Actions check and concentrated `requested_reviewers` — then freeze the sprint-model shape against that seeded data before writing any agent node.

Runner-up risk: building all closed-loop features at once. Order them: closed-loop GitHub writes → Slack report → approval queue → conversational → frontend polish, so the graded "notify → do" property exists even if time runs out.
