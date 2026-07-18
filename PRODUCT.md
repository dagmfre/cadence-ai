# Cadence — Product Context

## Register
**product** — app UI. Design serves the task: a delivery lead scanning sprint health, approving agent actions, and interrogating risk. Earned familiarity is the goal; the tool should disappear into the work.

## Platform
web

## What Cadence is
An **Engineering Delivery Manager AI**. It watches one team's GitHub repo + Projects v2 board + Slack, scores delivery risk deterministically, forecasts sprint completion (RAG), and then **acts** — labels risky PRs, comments on stalled ones, posts a delivery report, DMs the right owner. It answers "why are we slipping?" with item-level evidence and can execute the fix from the reply.

The dashboard is the **control room**: connect the workspace, read the risk, approve the actions, ask the questions.

## Users

| Role | Who | What they do here |
|---|---|---|
| **Delivery Lead** | The dev/EM who connects Cadence. Owns the account. | Runs the connect wizard, reads the forecast, approves drafted actions, sets the autonomy dial, asks questions. Lives in Overview + Actions. |
| **Team Member** | Anyone on the mapped roster | Never has to open the dashboard — Cadence reaches them in Slack and on their PRs. May sign in to read the board. |
| **Evaluator** | A founder watching a 5-minute demo video | Judges the whole product on first impression. Every screen must look shipped. |

## Accounts & auth (new in v2)
Cadence now has real accounts, not a shared access key.

- **Register** → email + password creates the account and its workspace, then drops straight into the Connect Wizard.
- **Sign in** → returns to wherever they were; session persists across restarts.
- **Sign out** → from the account menu in the top bar.
- One account owns one workspace for now; the data model is workspace-scoped so multi-workspace is a later switch, not a rewrite.
- Everything behind auth: the dashboard, the wizard, and every `/api` route except the auth endpoints themselves.

## Purpose / the one graded thing
Cadence must **act**, not just report. Any surface that doesn't lead to a decision or an action is decoration. The approve-and-apply path is the most important interaction in the product and must always look consequential.

## Positioning
The calm senior EM who reads every PR so you don't have to — and who tells you the one thing to fix today. Not a metrics wall. Not a chatbot. A colleague with commit access and good judgment.

## Brand personality
**Precise · calm · evidence-first.** Never alarmist, never cute. States the number, names the item, proposes the fix. Confidence comes from specificity, not from exclamation.

## Anti-references
- **Generic SaaS analytics** — gradient hero metrics, big meaningless donuts, purple-on-navy.
- **AI-tool neon/glassmorphism** — glow, blur, "magic" sparkle iconography.
- **Enterprise admin bloat** — Jira's *chrome* and toolbar-on-toolbar density is not the goal.
- **A Jira clone.** We borrow Jira's *information density, iconography discipline, and shell structure* — not its palette or its complexity.

## Design principles
1. **Evidence over decoration.** Every number traces to an item you can click through to GitHub.
2. **One loud thing per screen.** The RAG state on Overview; the Approve button on Actions. Everything else stays quiet.
3. **Density where data lives, air where decisions happen.** Tables and lists run compact; the approval card and the wizard get room.
4. **Semantic color is spent, not sprinkled.** Red/amber/green mean forecast and severity — nothing else may use them.
5. **Never a dead end.** Every empty state teaches the next action; every error names the fix.

## A11y
WCAG AA on all body text (4.5:1) against dark surfaces; full keyboard path through wizard → approve → sign-out; visible focus ring on every control; status changes announced via `role="status"`; motion respects `prefers-reduced-motion`.
