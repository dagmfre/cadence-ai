# Cadence — Engineering Delivery Manager AI

A hiring take-home (Level 1 of 4). Cadence watches **one team's one GitHub repo and one sprint**, and instead of just reporting, it **acts** — labels risky PRs, comments on stalled ones, posts a delivery report to Slack, DMs at-risk owners, and answers "why are we slipping?" with evidence then acts from the reply.

**Deadline: midnight 2026-07-18.** This is a ~30-hour sprint. Optimize for a working, demoable, closed-loop system over polish or completeness.

---

## The one rule that decides the grade

**Closed-loop action — turning "notify" into "do".** The reviewer already called a read→analyze→notify version "basic". Cadence is graded on whether it *changes GitHub/Slack state*, not whether it reports. **If a feature doesn't make Cadence act, it is cuttable.** When time is tight, cut in this order: frontend polish → conversational agent → *never* the GitHub writes.

---

## STRICT: Ground before you plan or write non-trivial code (non-negotiable)

Before preparing any implementation plan or writing non-trivial code, **ground the technical details against the authoritative source** — never from memory alone. Use whichever apply:

- **LangChain Docs MCP** (`search_docs_by_lang_chain` / `query_docs_filesystem`) — for anything touching LangGraph.js / LangChain / Gemini-via-LangChain. Pin the installed version, ground every snippet against *that* version (this already caught the `StateSchema` API needing zod v4).
- **Slack MCP** (`plugin_slack_slack__*`) + the `slack:slack-api` / `slack:block-kit` skills — for Slack Web API methods, required scopes, token types, Block Kit, Socket Mode.
- **octokit-docs plugin** (`octokit-docs__*`) — for Octokit REST/GraphQL usage, endpoints, and pagination (already confirmed Projects classic is dead → v2 GraphQL).
- **Exa / WebSearch** — for live facts that shift: free-tier limits, model IDs, API deprecations, current library versions.

Rule of thumb: if a fact can change between versions or over time (an API shape, a scope name, a limit, a model id), verify it *now* rather than assume. Cite what you grounded against in the plan.

## Interaction contract (read first)

- **Re-evaluate my prompts:** Always double-check the accuracy, relevance, and completeness of my instructions. If you think I am wrong, or miss points, provide you in-complete or inaccurate instructions, you have the agency and expertise to enhance/correct/complete them. Do not just follow blindly. With that being said, mostly my prompts will be good, and you should follow them. But always re-evaluate them before acting.
- **Act on explicit directives.** When I say "implement this" / "I want you to X", build it now — don't propose-and-pause. Save the propose-first discipline for genuinely ambiguous or risky calls.
- **Small steps, real feedback.** After each meaningful change: `pnpm run typecheck` + run the real thing against the seeded repo. This is a no-test-suite sprint (deadline) — the type checker and running it for real are the safety net.
- **Never leave it worse than you found it.** Minimal code, reuse files/functions before adding new ones.

---

## Build contract & docs

- **`docs/DECISIONS.md`** — the locked, internet-verified tech contract (host, state store, model, agent pattern, Slack mode, GitHub calls, token perms). Treat every named version/limit as a constraint. Read it before building anything.
- **`docs/claude-ai-research-brief.md`** — the brief that produced DECISIONS.md.
- **`Engineering Delivery Manager AI.md`** — the solution-design doc sent to the reviewer.
- **`Convo with claude.ai.md`** — the running architecture/research conversation.

## Tech stack (locked — see DECISIONS.md for why)

| Layer | Pick |
|---|---|
| Language | TypeScript end to end |
| Backend | Fastify, single repo (`/server`, `/web`), pnpm |
| Agents | LangGraph.js `StateGraph`, 3 sequential nodes (risk+cause → forecast → action); conversational = **separate** graph |
| Model | `gemini-3.5-flash` via `@langchain/google-genai` (fallback `gemini-2.5-flash`); pin versions |
| State | Upstash Redis over HTTP (pending/approved actions, run history, `thread_ts → context`) |
| GitHub | REST via Octokit + Checks API; Projects v2 board status via `octokit.graphql` (classic is dead — DECISIONS §10) |
| Slack | Socket Mode |
| Host | Koyeb (no sleep); daily trigger via cron-job.org hitting `/run-daily-scan` |

## Architecture / module map

Data flows one direction: **ingest → sprint model → deterministic scoring → agent pipeline → actions**.

| Module | In → out | Nature | Purpose |
|---|---|---|---|
| **Ingest** | repo → sprint model | deterministic | Octokit pulls milestone/issues/open-PRs/check-runs; builds one sprint model + reviewer-load rollup. |
| **Core** | sprint model → risk scores + forecast | deterministic (no LLM) | Staleness/review-latency scoring, completed-vs-remaining forecast, RAG, projected slip. Stable + explainable. |
| **Agents** | scored model → findings + plan | AI (Gemini) | risk+cause → forecast → action. Emits `RiskFinding[]`, `Forecast`, `ActionPlan`. |
| **Actions** | plan → GitHub/Slack writes | deterministic | Octokit label/comment; Slack report + DMs. Auto on schedule, or via approval queue. |
| **Conversational** | question + sprint model → answer + action | AI | Separate graph; answers with evidence, acts from the reply (Slack thread / UI). |
| **Workspace** | connect inputs → validated workspace (creds, repo/board, channel, roster, autonomy) | deterministic | The product layer: connect wizard APIs, GitHub↔Slack identity map + routing, autonomy dial. See `docs/PRODUCT_FLOWS.md`. |
| **Web** | REST → UI | React + Vite | Connect wizard, risk list, forecast/RAG, approval panel, chat, Settings, scan button. |

Data model: `DeliveryItem`, `RiskFinding` (incl. `rootCause` + `recommendedAction`), `Forecast` (likelihood, projected slip, RAG), `ActionPlan`.

**Seeding note:** GitHub can't backdate `created_at`. Risk is driven off controllable signals (`blocked` label, draft PR, real failing Actions check, pending `requested_reviewers`) + a low relative staleness threshold — never real multi-day age. See `scripts/seed.ts`.

---

## Strict rules

- **Never commit secrets.** `.env` is gitignored. The GitHub token was exposed in chat — rotate it after submission. `.env` must never enter the submission repo.
- **LangChain Docs MCP for all LangGraph/LangChain work.** Pin one `@langchain/langgraph` version, pick one state syntax (don't mix `StateSchema` vs `Annotation.Root`), and ground every snippet against the MCP for that version.
- **No AI co-author in commits.** Never add `Co-Authored-By: Claude` or any AI attribution.
- **CLI/UI parity later:** any run knob added to the API must also appear in the UI, and vice versa.

## Commands

```
pnpm install
pnpm seed            # seed the demo repo with every risk signal
pnpm seed --reset    # cleanly remove everything the seeder created
pnpm run typecheck   # the always-on safety net
```
