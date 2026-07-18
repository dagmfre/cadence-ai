# Cadence — Product Flows & Team Model

*How a developer who has never seen Cadence connects it to **their** repo, board, and Slack — and everything that happens after. This is the product-experience contract; DECISIONS.md locks the tech behind it.*

---

## 0. The product model in one paragraph

Cadence is **workspace-based**. A workspace = one team's connection set: a GitHub repo + its Projects v2 board + a Slack workspace/channel + a team roster that maps GitHub identities to Slack identities. Everything Cadence stores (credentials, mappings, runs, pending actions, chat threads) lives under the workspace key in Redis. The demo runs one workspace; the architecture supports many — that's what makes it a product, not a script.

---

## 1. Roles

| Role | Who | What they do | Surface |
|---|---|---|---|
| **Delivery Lead** | The dev who connects Cadence (workspace creator) | Runs the connect wizard, sets the autonomy mode, approves drafted actions, reads forecasts, asks "why are we slipping?" | Web dashboard + Slack |
| **Team Member** | Anyone on the mapped roster | Receives targeted nudges (DMs/mentions), sees Cadence's labels/comments on their PRs/issues, can ask Cadence questions in Slack | Slack + GitHub |

No separate admin system: the Delivery Lead's workspace access key (generated at the end of the wizard, shown once) gates the dashboard. Team Members never need to log in anywhere — Cadence comes to them.

---

## 2. The new-dev walkthrough (end to end)

```
 A dev lands on the Cadence dashboard (deployed URL)
        │
        ▼
 ┌─ CONNECT WIZARD ────────────────────────────────────────────┐
 │ Step 1 · GitHub    paste PAT (scopes shown inline)          │
 │                    → live-validate → pick repo from list    │
 │                    → pick Projects v2 board → sprint        │
 │                    milestone auto-detected                  │
 │ Step 2 · Slack     one-click app manifest (pre-configured   │
 │                    scopes + Socket Mode) → paste bot+app    │
 │                    tokens → live-validate → pick channel    │
 │ Step 3 · Team      Cadence auto-builds the roster and       │
 │                    proposes GitHub↔Slack matches (§4);      │
 │                    dev fixes any misses inline              │
 │ Step 4 · Autonomy  Observe / Copilot / Autopilot (§5)       │
 │                    → first scan runs live → workspace key   │
 │                    issued                                   │
 └─────────────────────────────────────────────────────────────┘
        │
        ▼
 Dashboard: risk list · forecast/RAG · board view · pending
 actions · chat.  Daily cron scans automatically from now on.
```

**Step-1 detail (GitHub):** primary path is **"Sign in with GitHub" (OAuth web flow)** — Cadence redirects to GitHub, the dev authorizes scopes `repo project read:user user:email`, and the callback stores the token on the workspace; no copy-pasting. An "advanced" fallback in the same step accepts a classic PAT (`repo` + `project`) for air-gapped/demo resilience. Either way, Cadence then calls `GET /user`, lists repos and the user's/org's ProjectV2 boards, so the dev *picks* rather than types; validation failures show the missing scope by name.

**Step-2 detail (Slack):** Cadence serves a ready-made **Slack app manifest** (JSON) — the dev pastes it at api.slack.com → "Create app from manifest", which pre-configures all bot scopes (`chat:write`, `im:write`, `users:read`, `users:read.email`, `app_mentions:read`, `channels:history`, `im:history`) and Socket Mode. They paste back the bot token (`xoxb-`) + app token (`xapp-`), Cadence validates with `auth.test`, lists channels, dev picks the report channel and invites the bot (`/invite @Cadence` — the wizard says so).

**Why BYO-token instead of OAuth:** deliberate scoping (DECISIONS §12). The full OAuth/GitHub-App install flow is the documented production upgrade; the wizard's *shape* (validate → discover → pick) is identical either way, so swapping the credential step later touches nothing else.

---

## 3. Surfaces — where things appear (the posting matrix)

Both surfaces, always mirrored; Slack is the push channel, the dashboard is the record.

| Event | Slack | Dashboard | GitHub |
|---|---|---|---|
| Daily/on-demand delivery report | ✅ report channel | ✅ run history | — |
| Per-owner nudge (stalled PR, blocked issue, review request) | ✅ DM to mapped member (fallback: @mention in channel) | ✅ logged on the run | — |
| Risk actions (label `at-risk`/`blocked`, stall comment) | summarized in report | ✅ drafted/approved/applied states | ✅ the label/comment itself |
| Forecast flips to Red / projected slip grows | ✅ escalation to Delivery Lead | ✅ RAG banner | — |
| Q&A ("why are we slipping?") | ✅ @Cadence in channel/thread or DM | ✅ chat panel | — |
| Action taken from a Q&A reply | ✅ confirm in-thread | ✅ chat + action log | ✅ if it's a GitHub action |

**Conversational access is symmetric by design:** the same conversational agent (same graph, same sprint-model evidence) serves both. In Slack you mention the bot and confirm with a reply ("do it"); on the web you type in the chat panel and confirm with a button.

**Conversation persistence (DECISIONS §15):** both surfaces share one `Conversation` shape in Redis (`ws:{id}:convo:{convoId}` → messages with role/text/evidence/proposed action). The web chat is a persistent workspace conversation; each Slack thread is its own conversation (`convoId = thread_ts`). Either surface survives restarts, and the dashboard can show Slack-originated conversations in the chat history.

**Sprint scoping (DECISIONS §17):** every view and message is scoped to a sprint (= GitHub milestone). The dashboard's sprint selector defaults to the nearest-due open milestone; the Slack report names the sprint it covers; chat evidence cites items of the sprint under discussion.

---

## 4. Identity: connecting GitHub people to Slack people

The real-world problem: GitHub knows `dagmfre`, Slack knows `U07AB12CD`. Nudging the *right human* is the whole value of targeted messaging, so Cadence treats the mapping as a first-class object.

**Roster building (wizard Step 3):**
1. **GitHub side:** collect every login seen in the repo's sprint: issue assignees, PR authors, requested reviewers, recent committers.
2. **Slack side:** members of the chosen channel (`conversations.members` + `users.info`, including profile email via `users:read.email`).
3. **Auto-match, in confidence order:** (a) email exact match (GitHub public/commit email ↔ Slack profile email), (b) normalized-name match (GitHub login/display name ↔ Slack display/real name, case/punctuation-insensitive), (c) unmatched → flagged.
4. **Human confirm:** the wizard shows the proposed table (GitHub login → Slack member, with confidence); the dev fixes misses with a dropdown. Saved to the workspace. Editable later in Settings.

**Routing rules (who gets which message):**

| Signal | Recipient | Message intent |
|---|---|---|
| PR stalled / CI failing | PR **author** | "your PR needs a push" + root cause + recommended action |
| Review requested, no review, reviewer overloaded | requested **reviewer** (and author on reassign suggestion) | "this review is the bottleneck" |
| Issue blocked / stale / parked on the board | issue **assignee** | "this item is stuck — here's the suggested next step" |
| At-risk item with **no** assignee · forecast → Red · scope creep | **Delivery Lead** | escalation: decide, reassign, or descope |
| Unmapped GitHub user involved | report channel (@here-free mention of the GitHub login) | graceful degradation — never silently drop a nudge |

---

## 5. Autonomy modes (the trust dial)

Set in the wizard, changeable in Settings — per workspace, checked before every outbound action:

| Mode | GitHub writes (label/comment) | Slack report | Owner DMs |
|---|---|---|---|
| **Observe** | drafted only | posted | drafted only |
| **Copilot** *(default)* | drafted → approve to apply | posted | drafted → approve to send |
| **Autopilot** | applied automatically, logged | posted | sent automatically, logged |

The scheduled daily scan respects the same dial. This is the honest answer to "how much do I trust an agent that writes to my repo?" — the user decides, per workspace, and every automatic action is still logged and reversible (labels removable, comments attributable to the bot).

---

## 6. The workflows (reference)

- **W1 · Scheduled scan:** cron → ingest (REST + board GraphQL) → deterministic scoring → agent pipeline (risk+cause → forecast → action) → actions per autonomy mode → report + nudges → run recorded.
- **W2 · On-demand scan:** dashboard button or "scan" to the bot → same pipeline, results land in both surfaces.
- **W3 · Q&A + act-from-reply:** question (either surface) → conversational agent answers with item-level evidence from the latest sprint model → proposes an action → confirmation ("do it" / button) → execute → confirm with link.
- **W4 · Approval queue:** pending actions persisted in Redis with full preview (exact label, comment text, DM text) → approve/dismiss → apply → state transitions logged.
- **W5 · Onboarding:** the §2 wizard; every step validates live before advancing; finishing issues the workspace key and schedules the daily scan.
- **W6 · Identity resolution:** §4 auto-match at setup; re-run when new GitHub logins appear in a scan (new contributor → flagged in the report until mapped).

---

## 7. Production-upgrade path (documented, deliberately not built for the demo)

1. **GitHub App + Slack OAuth install** replacing pasted tokens (same wizard shape; adds signed webhooks → event-driven scans instead of polling-by-cron).
2. **Multi-workspace auth** — real user accounts for Delivery Leads; workspace switcher.
3. **Approve from Slack** — interactive buttons on drafted actions (Socket Mode already carries the events).
4. **Cross-run memory** — per-person/per-area slip patterns feeding the forecast.
