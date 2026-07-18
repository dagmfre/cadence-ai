# Cadence — Demo Recording Script

Everything needed to record the submission video: what to do beforehand, what to record,
and what to say while recording.

The single graded property is **"notify → do"** — Cadence doesn't just report risk, it
takes real action in GitHub and Slack with a human in the loop. Every beat below exists
to show that.

---

## Part 0 — The cast

Seeded so that three different people own three different problems. That matters: an EDM
that messages one person about one thing is a report generator. One that routes the right
nudge to the right human is a manager.

| Person | GitHub | Slack | What they own in the sprint |
|---|---|---|---|
| You (delivery lead) | `dagmfre` | `@dagmfre` | 5 assigned PRs, incl. failing-CI **#12** |
| Dev A | `dagib` | `@dagmfrea` | **4 pending reviews** (the bottleneck) + stalled PR **#17** + parked draft **#18** |
| Dev B | `dagmfreb-spec` | `@dagmfreb` | failing-CI PR **#16** + blocked issue **#4** |
| — | (nobody) | — | blocked issue **#5** — at-risk with no owner |

> **Verify the Slack pairing.** `TEAM_MAP` now maps GitHub → Slack as
> `dagib → U0BJ6BNA1J6 (@dagmfrea)` and `dagmfreb-spec → U0BK0M3HQF2 (@dagmfreb)`.
> That pairing was inferred from the names — if it's backwards, swap the two U-ids in
> `.env` **and** in the Koyeb env vars, or the DMs reach the wrong person on camera.

### The 14 findings a scan currently produces

| Category | Items | Severity |
|---|---|---|
| `review-bottleneck` | #14 #15 #16 #17 #18 | high |
| `blocked-issue` | #4 #5 | high |
| `failing-ci` | #12 #16 | high |
| `unassigned-at-risk` | #5 | high |
| `board-stagnation` | #6 #7 | medium |
| `stalled-pr` / `parked-draft` | #13 / #11 | medium |

---

## Part 1 — Before you hit record

### 1.1 Ship the current code (required — several fixes are not deployed yet)

```bash
git push origin main
```

Wait for Koyeb to finish the deploy. Without this, the recording hits bugs already fixed:
the blank page on reload, the 502 on "Run scan", and the chat answering "try rephrasing".

### 1.2 Koyeb environment variables

| Variable | Value | Why |
|---|---|---|
| `TEAM_MAP` | `{"dagmfre":"U0BJA2Z1FC4","dagib":"U0BJ6BNA1J6","dagmfreb-spec":"U0BK0M3HQF2"}` | **Was wrong** — mapped Slack names as GitHub logins, so DMs would have fallen back to channel mentions |
| `PROJECT_NUMBER` | `2` | **Was missing** — without it the board signals never fire |
| `ANTHROPIC_API_KEY` | your key | Puts Claude in the model picker |
| `LANGSMITH_TRACING` / `_API_KEY` / `_PROJECT` | `true` / your key / `cadence` | Traces on camera |
| `CRON_SECRET`, `NODE_ENV=production`, Upstash pair | as documented | Nightly scan, secure cookie, persistence |

### 1.3 Invite the bot to the Slack channel

In `#cadence-ai`: `/invite @Cadence`

Cadence auto-joins public channels now, but if the channel is private this is the only
way, and a failed report on camera is a bad look.

### 1.4 Clean the slate

```bash
pnpm reset:slack     # deletes Cadence's own channel posts + DMs
pnpm reset:actions   # removes at-risk labels + Cadence comments from GitHub
pnpm reset:chat      # clears the headless (Slack-side) conversation history
```

**Your own Slack messages stay** — a bot token can't delete what a human typed. Two options:

- Scroll up and delete your old `@Cadence …` messages by hand, **or**
- Create a fresh channel (e.g. `#sprint-delivery`), invite the bot and the two dev
  accounts, and select that channel in the wizard while recording. Cleanest, and it
  makes the wizard step feel real.

Your **dashboard** chat history is handled by recording from a **new account** (Part 2,
Beat 1) — a new account gets its own empty workspace. For re-takes, the Chat page now has
a **New chat** button.

### 1.5 Timing (the one thing that can quietly ruin a take)

Two signals need an item to sit untouched for `STALE_THRESHOLD_MINUTES` (default 30):
`stalled-pr` and `parked-draft`.

**Do not run `pnpm seed` or `pnpm seed:team` right before recording.** The data is already
seeded and aged. If you do re-seed, wait 30 minutes before recording.

Confirm you're ready — expect **14 findings**:

```bash
pnpm scan
```

### 1.6 Final pre-flight

- [ ] `git push` done, Koyeb deploy finished
- [ ] `pnpm scan` shows 14 findings across 6 categories
- [ ] Slack channel shows no Cadence messages
- [ ] GitHub shows no `at-risk` labels or Cadence comments
- [ ] Signed **out** of the dashboard
- [ ] Browser tabs open: dashboard · GitHub repo (Issues) · Slack · LangSmith
- [ ] Screen resolution ~1280×800, browser zoom 100%, notifications off

---

## Part 2 — What to record

Six beats, ~5–6 minutes. Timings are a guide, not a target.

### Beat 1 — Sign up and connect (≈60s)

1. Dashboard → **Create account** with a fresh email
2. Wizard **GitHub** → Sign in with GitHub → pick `dagmfre/better-auth` → board `2`
3. Wizard **Slack** → pick the channel
4. Wizard **Team** → show the GitHub↔Slack roster it built
5. Wizard **Autonomy** → choose **Copilot** → Finish

> *"Cadence starts as a new workspace. It connects to GitHub — the repo and the Projects
> board — and to Slack. It reads the team roster and matches GitHub accounts to Slack
> accounts, because when it decides someone needs a nudge, it has to know how to reach
> them. And the last step is the important one: the autonomy dial. Observe, Copilot, or
> Autopilot. I'm choosing Copilot, which means Cadence will draft real actions but won't
> touch anything until I approve it."*

### Beat 2 — The forecast (≈45s)

Land on Overview. Point at the RAG banner, then the risk cards.

> *"This is a real sprint, scanned live. The forecast is deterministic — completion
> likelihood, projected slip, and the RAG status are computed from the sprint's own
> velocity and remaining work, not guessed by a model. That's deliberate: the numbers are
> auditable, and the model is never allowed to overwrite them. What the model adds is the
> reasoning — the root cause under each risk, and what to do about it."*

Scroll the risk list.

> *"Fourteen risks across six categories, all from live GitHub data: a review bottleneck,
> two blocked issues, two failing CI checks, items stagnating on the board, and a PR
> nobody's touched. Notice they belong to different people."*

### Beat 3 — Run the closed loop (≈75s)

Actions → **Run scan now**. While it runs (~30s), open LangSmith.

> *"Run scan now kicks off the full pipeline. It takes a couple of minutes, so it runs in
> the background and the dashboard follows it — no request is held open."*

In LangSmith, open the newest `cadence-run` trace and expand it.

> *"Every run is traced. Here's the whole thing end to end: the deterministic scan, then
> the agent graph — risk and root cause, then the forecast narrative, then the action
> plan — and finally what was actually executed. Token cost and latency per step. When
> something goes wrong, this is where I look, and it's how I found and fixed two real
> bugs in this pipeline."*

Back to Actions when it completes.

> *"And here's the point. Cadence didn't just tell me the sprint is red. It drafted the
> actions it wants to take: label these at-risk, comment on that stalled PR, and DM these
> three people. In Copilot mode it's waiting for me."*

### Beat 4 — Approve, and show the real effects (≈75s)

This is the graded moment. Approve **three** actions of different kinds:

1. A **label** on a blocked issue → switch to GitHub → refresh → show the `at-risk` label
2. A **comment** on a PR → refresh → show the comment, `@`-mentioning the author
3. A **DM** to a dev → switch to Slack → show the DM arriving

> *"I approve the label — and that's a real write to GitHub. There it is on the issue.
> I approve the comment — and it's on the pull request, addressed to the person who owns
> it, saying what's wrong and what to do next. And the DM — this went to the developer who
> is actually holding up four reviews, in Slack, from Cadence. Nothing here is a mock.
> This is the loop closing: it noticed, it decided, it acted, and I stayed in control of
> every one of those."*

Also show the channel report.

> *"And the daily report went to the team channel — the same run, one summary for
> everyone."*

### Beat 5 — Conversation, in both places (≈75s)

Dashboard **Chat** → *"Why are we slipping?"*

> *"Cadence is also conversational, and it answers with evidence rather than vibes."*

Read the answer aloud — it will cite item numbers and people.

Then: *"What single action would help most?"* → it proposes an action → click **Do it**.

> *"When it proposes something, I can approve it right in the conversation."*

Switch to Slack. In the channel: `@Cadence why are we slipping?`

> *"Same agent, same evidence, from Slack — because that's where the team already lives.
> This isn't a second implementation; it's the same pipeline behind both surfaces."*

Reply `do it` in the thread.

> *"And I can approve from Slack too."*

### Beat 6 — Autonomy and the nightly run (≈45s)

Move the dial to **Autopilot**, then **Settings** (or the model picker).

> *"The dial is the trust control. Observe watches and says nothing. Copilot — what you
> just saw — drafts everything and waits for me. Autopilot applies it directly, for teams
> that want it running unattended. And there's a scheduled scan every morning, so the
> team walks in to a report that's already current."*

Show the model picker.

> *"It's model-agnostic — Gemini or Claude, switchable per workspace, because the
> deterministic core doesn't depend on which model is reasoning over it."*

**Close:**

> *"That's Cadence. It watches a real sprint, forecasts where it lands, works out why, and
> then actually does something about it — with the team's manager deciding how much rope
> it gets."*

---

## Part 3 — After recording

```bash
pnpm reset:actions   # undo labels/comments/Slack posts
pnpm reset:slack     # clear Cadence's channel + DM messages
```

Then:

1. Submit to **kidus@brain3.ai**
2. **Rotate the GitHub PAT** and regenerate the Slack tokens — both were exposed in chat
   during development

---

## If something goes wrong mid-take

| Symptom | Do this |
|---|---|
| Scan seems stuck | It takes 1–4 min. The page follows it; check LangSmith for a live trace. |
| Report didn't post to Slack | Bot isn't in the channel — `/invite @Cadence`. The run itself still completed and is in Run history. |
| A DM went to the channel instead | That login is missing from `TEAM_MAP` — the graceful fallback. Fix the map, re-run. |
| Findings show no root cause | The model degraded; numbers are still real. Re-run, or switch model in the picker. |
| Blank page | You're on a pre-fix build — `git push` and redeploy. |
| Chat needs resetting between takes | **New chat** button on the Chat page. |
