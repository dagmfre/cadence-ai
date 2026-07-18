# Cadence — Engineering Delivery Manager AI
### Solution Design Document (Level 1 Assignment)

**Author:** Dagmfre — AI Engineer and Senior Full-Stack Developer
**Assignment:** AI Automation — Full Stack AI Software Engineer
**Scope:** 1-day build, single team / single repository

---

## 1. The role chosen and why

**Role:** Engineering Delivery Manager (EDM) for a software team.

An EDM tracks whether a team will ship its planned work on time and surfaces what is blocking it. The role covers delivery tracking, risk detection, completion forecasting, and status reporting. It is not people management and not writing code.

**Why this role:**

- It is a recurring operational need in most engineering teams.
- It cannot be handled by a simple chatbot. The work is to continuously read delivery signals, decide what matters, and take action, not to answer questions on request.
- The scope is narrow and measurable: one team, one repository, one sprint at a time.

The agent reads all sprint and task data from GitHub, so no separate project-tracking tool is required.

---

## 2. Key tasks and workflows

The agent handles four tasks:

1. **Track delivery health** — pull sprint and task data from GitHub (milestones, issues, pull requests, CI status) and build a single view of the current sprint.
2. **Detect risk, explain cause, and forecast** — flag stalled pull requests, blocked issues, review delays, and scope changes; explain the root cause of each issue and recommend the next best action; estimate whether the sprint will finish on time and the projected slip.
3. **Take action** — act directly on GitHub (auto-label risky pull requests, comment on stalled pull requests), post a daily delivery report to Slack, and send targeted messages to owners of at-risk work.
4. **Answer questions** — respond to questions such as "why are we slipping?" in Slack or the UI with evidence from the sprint model, then take an action from the reply.

### Workflow

```
Trigger: Cloud Scheduler (daily), user "Scan", or a user question
        |
        v
[Ingest]              Pull GitHub milestones, issues, PRs, CI; build sprint model
        |
        v
[Risk + cause agent]  Flag at-risk items; explain root cause; recommend next action
        |
        v
[Forecast agent]      Completion likelihood + projected slip (RAG status)
        |
        v
[Action agent]        GitHub actions (label/comment) + Slack report + messages
        |
        v
[Act]                 Apply GitHub labels/comments; post to Slack (auto or on approval)


Conversational path (parallel):

User asks "why are we slipping?"  (Slack thread or UI)
        |
        v
Agent answers with evidence from the sprint model
        |
        v
Can trigger an action from the reply (label, comment, or Slack message)
```

### GitHub as the task and sprint source

| Delivery concept | GitHub source |
|---|---|
| Sprint (with due date) | Milestone (`due_on`, open/closed counts) |
| Tasks | Issues in the milestone |
| Task status | Issue state + labels + linked PR |
| Active work | Open pull requests (review state, CI, age) |
| Velocity | Issues/PRs closed over recent days |
| Blocked work | `blocked` label or linked blocking issue |
| Task board status | Projects v2 item Status field (Backlog / Ready / In progress / In review / Done) |

Sprint model, forecast, and velocity come from three REST calls — milestones, issues by milestone, and open pull requests — plus one GraphQL query that reads each item's status from the team's Projects v2 board. GitHub is also the target of write actions (labels and comments).

---

## 3. High-level architecture and technical approach

The system is TypeScript end to end.

```
                     FRONTEND (React + TypeScript, Vite)
     Dashboard: risk list, forecast/RAG status, pending actions (approve),
                     chat panel, command input, scan trigger
                              |
                          REST (HTTPS)
                              |
                     BACKEND (Node.js + TypeScript, on Cloud Run)
     +--------------------------------------------------------------+
     |  Ingest layer     Octokit GitHub client -> sprint model      |
     |  Agent pipeline   LangGraph.js: Risk+Cause -> Forecast ->    |
     |                   Action (Gemini per node via LangChain)     |
     |  Conversational   Q&A agent over the sprint model; can act   |
     |  Core logic       Risk scoring + forecast functions          |
     |                   (deterministic TypeScript)                 |
     |  Action layer     GitHub write client + Slack Web API client |
     +--------------------------------------------------------------+
          |               |                |               |
       GitHub API      Gemini API        Slack API     Cloud Scheduler
       (read+write)    (key)             (bot token)   (daily trigger)
```

### Backend (Node.js + TypeScript)

- **HTTP service** — Fastify (or Express), deployed as a container on Cloud Run.
- **Ingest layer** — Octokit client that pulls milestones, issues, pull requests, CI status, and each item's Projects v2 board status (one GraphQL query), and normalizes them into one sprint model.
- **Agent pipeline** — LangGraph.js graph with three nodes, each using Gemini through LangChain:
  - *Risk and root-cause agent* — returns risk findings with reason, severity, root cause, and a recommended next action.
  - *Forecast agent* — returns completion likelihood, projected slip, and RAG status.
  - *Action agent* — returns GitHub actions (labels, comments) plus the Slack report text and per-owner messages.
- **Conversational agent** — answers delivery questions (for example "why are we slipping?") from the current sprint model, cites the specific items as evidence, and can trigger an action from the reply.
- **Core logic** — risk scoring and forecast calculations written in TypeScript, not prompted. Handles staleness thresholds, review-latency scoring, and completed vs remaining work against days left in the sprint. This keeps output stable and explainable.
- **Action layer** — a GitHub write client (Octokit) for labels and comments, and a Slack Web API client for the report and messages.
- **Scheduler endpoint** — a `/run-daily-scan` route triggered by Cloud Scheduler.

### Frontend (React + TypeScript)

- Single-page app built with Vite.
- **Dashboard** — sprint selector (sprints come from GitHub milestones; all views are per-sprint); risk items with reason, severity, root cause, and recommended action; forecast and RAG status.
- **Chat panel** — ask questions like "why are we slipping?" and get an evidence-backed answer; trigger an action from the reply.
- **Pending actions panel** — drafted GitHub actions and Slack messages with an Approve button (preview then send).
- **Command input** — natural language, for example "scan repo X" or "what is at risk this sprint".
- **Scan button** — runs an on-demand scan.

### Data model

- **DeliveryItem** — id, type (issue/PR), title, owner, status, board status (Projects v2 column), age, dependencies, CI state.
- **RiskFinding** — item reference, category, severity, reason, root cause, recommended action.
- **Forecast** — completion likelihood, projected slip (days), RAG status.
- **ActionPlan** — GitHub actions (label/comment targets), Slack report text, list of messages (owner, text, channel).

---

## 4. Third-party APIs and integrations

| Integration | Auth | Use | Free tier |
|---|---|---|---|
| GitHub API (Octokit, REST + GraphQL) | Fine-grained token (read + write) | Read sprint/tasks/PRs/CI + Projects v2 board status; write labels and comments | Yes, no card |
| Google Gemini API | API key (AI Studio) | Reasoning for the agents | Yes, no card |
| Slack Web API | Bot token | Post report, send messages, answer in thread | Yes, no card |
| Cloud Scheduler | GCP (billing off) | Daily scan trigger | Always Free, 3 jobs/mo |
| Cloud Run | GCP (billing off) | Host the Node backend | Always Free, 180k vCPU-s/mo |

The GitHub token uses a fine-grained scope with issues and pull-request write access so the agent can apply labels and comments. All services run on free tiers with no credit card. No Cloud SQL is used. Persistence, if needed, uses the Firestore free tier; in-memory state is acceptable for the demo because scans are re-runnable.

---

## 5. Automation, actions, and UI

The agent takes action rather than only reporting.

**Scheduled scan.** Cloud Scheduler triggers a daily run. The agent ingests GitHub, scores risk, forecasts completion, and posts a delivery report to Slack without a user request.

**Acts directly on GitHub.** The agent writes back to GitHub, not only to chat. It auto-labels risky pull requests (for example `at-risk` or `blocked`) and comments on stalled pull requests to prompt the owner. This closes the loop instead of only notifying.

**Root-cause reasoning.** For each issue, the agent explains the underlying cause and recommends the next best action. Example: "PR #212 is stalled because its assigned reviewer has 6 open reviews. Recommended action: reassign the review to a teammate with capacity." The recommendation appears in the dashboard and in outbound messages.

**Conversational.** The user can ask "why are we slipping?" in Slack or the UI. The agent answers with evidence drawn from the sprint model (the specific pull requests and issues involved), then can take an action directly from that reply, such as adding a label, commenting, or sending a Slack message.

**Targeted messages.** For each at-risk item, the action agent drafts a message to the owner and sends it through Slack.

**User interaction in the UI.** From the dashboard the user can:

- Run an on-demand scan.
- Ask questions in the chat panel and act on the answer.
- Review each drafted GitHub action and Slack message, and approve it before it is applied or sent.
- View the current risk list with root cause and recommended action, forecast, and RAG status.

GitHub actions and outbound messages can run automatically on the daily schedule or wait for approval in the UI, so the user stays in control of what is applied or sent.

### Example run

```
Detected:   PR #212 open 3 days, 4 issues depend on it, CI failing
Root cause: Assigned reviewer has 6 open reviews, no review in 2 days
Forecast:   Sprint completion at ~60%, projected 2-day slip
Actions:    Labeled PR #212 "at-risk", commented asking to reassign the review,
            Slack message sent to the PR author, item listed in the daily report
```

---

## 6. Onboarding, roles, and team mapping

Cadence is **workspace-based**: any developer can connect it to their own repository, project board, and Slack — it is not hard-wired to one repo.

**Connect wizard (4 steps).** A new user: (1) signs in with GitHub (OAuth; a token-paste fallback exists), and Cadence lets them *pick* their repo and Projects v2 board from a list; (2) creates the Slack app from a pre-configured manifest Cadence provides (scopes and Socket Mode already set), pastes the tokens, and picks the report channel; (3) confirms the **team roster** — Cadence auto-matches GitHub users to Slack members by email, then by name, and flags anything it could not match for a one-click manual fix; (4) picks an autonomy mode and watches the first scan run. Finishing issues a workspace access key that gates the dashboard.

**Roles.** The **Delivery Lead** (whoever connects the workspace) configures, approves drafted actions, and receives escalations — unassigned at-risk work, a forecast turning red. **Team members** never log in: Cadence reaches them where they already are, via Slack DMs and GitHub comments on their own items.

**Identity-aware routing.** The GitHub↔Slack mapping drives who hears what: the PR author is nudged about their stalled PR, the requested reviewer about the review bottleneck, the issue assignee about blocked work, and the Delivery Lead about anything ownerless. If a GitHub user has no Slack match, the nudge degrades gracefully to a channel mention — it is never silently dropped.

**Autonomy modes.** Per workspace, the user chooses how much the agent acts on its own: **Observe** (draft everything, apply nothing), **Copilot** (default — GitHub writes and DMs wait for approval), or **Autopilot** (act immediately, log everything). The daily scheduled scan respects the same setting, so the team — not the agent — decides the trust level.

---

*Submitted for review and approval prior to build, per assignment instructions. To be sent to kidus@brain3.ai.*