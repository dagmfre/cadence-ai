/**
 * Deterministic core (DECISIONS: Verifier-grade ground truth, no LLM).
 * Risk rules emit facts; the LLM later explains (rootCause/recommendedAction)
 * but never overrides these numbers.
 */
import { Forecast, RiskFinding, SprintModel } from "./model.js";

const STALE_MS = Number(process.env.STALE_THRESHOLD_MINUTES ?? 30) * 60_000;
const PILEUP_THRESHOLD = 3;

const isStale = (item: { updatedAt: string }) => Date.now() - new Date(item.updatedAt).getTime() > STALE_MS;

export function scoreRisks(model: SprintModel): RiskFinding[] {
  const findings: RiskFinding[] = [];
  const open = model.items.filter((i) => i.state === "open");

  for (const it of open) {
    if (it.labels.includes("blocked"))
      findings.push({ itemNumber: it.number, category: "blocked-issue", severity: "high", reason: `Carries the "blocked" label` });
    if (it.ciStatus === "failing")
      findings.push({ itemNumber: it.number, category: "failing-ci", severity: "high", reason: "CI check concluded failure on the head commit" });
    if (it.type === "pr" && it.draft && isStale(it))
      findings.push({ itemNumber: it.number, category: "parked-draft", severity: "medium", reason: "Draft PR with no recent activity" });
    if (it.type === "pr" && !it.draft && isStale(it) && it.ciStatus !== "failing")
      findings.push({ itemNumber: it.number, category: "stalled-pr", severity: "medium", reason: `No activity past the staleness threshold` });
    if ((it.boardStatus === "In progress" || it.boardStatus === "In review") && isStale(it))
      findings.push({ itemNumber: it.number, category: "board-stagnation", severity: "medium", reason: `Parked in "${it.boardStatus}" with no recent activity` });
    if (it.boardStatus === "Done")
      findings.push({ itemNumber: it.number, category: "status-mismatch", severity: "low", reason: `Board says Done but the item is still open` });
    if (it.assignees.length === 0 && (it.labels.includes("blocked") || it.ciStatus === "failing"))
      findings.push({ itemNumber: it.number, category: "unassigned-at-risk", severity: "high", reason: "At-risk item has no assignee" });
  }

  for (const [login, count] of [...Object.entries(model.reviewerLoad), ...Object.entries(model.assigneeLoad)]) {
    if (count >= PILEUP_THRESHOLD) {
      const kind = model.reviewerLoad[login] === count ? "pending reviews" : "assigned open items";
      const affected = model.items.filter(
        (i) => i.state === "open" && i.type === "pr" && (i.requestedReviewers.includes(login) || i.assignees.includes(login)),
      );
      for (const it of affected)
        findings.push({
          itemNumber: it.number,
          category: "review-bottleneck",
          severity: "high",
          reason: `${login} carries ${count} ${kind} — this PR is queued behind that load`,
        });
      break; // one overloaded person is the signal; avoid duplicate spam per user
    }
  }

  // de-dupe (itemNumber, category)
  const seen = new Set<string>();
  return findings.filter((f) => {
    const k = `${f.itemNumber}:${f.category}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

export function forecast(model: SprintModel): Forecast {
  const due = model.sprint.dueOn ? new Date(model.sprint.dueOn).getTime() : Date.now();
  const daysLeft = Math.max(0, (due - Date.now()) / 86400000);
  const remaining = model.sprint.openCount;
  const velocityPerDay = model.closedLast7Days / 7;

  const projectedDays = velocityPerDay > 0 ? remaining / velocityPerDay : Infinity;
  const completionLikelihood =
    remaining === 0 ? 100 : Math.round(Math.max(0, Math.min(1, daysLeft / projectedDays)) * 100);
  const projectedSlipDays = projectedDays === Infinity ? Math.max(remaining, 1) : Math.max(0, Math.ceil(projectedDays - daysLeft));
  const rag = completionLikelihood > 75 ? "green" : completionLikelihood >= 50 ? "amber" : "red";

  return { completionLikelihood, projectedSlipDays, rag, daysLeft: Math.round(daysLeft * 10) / 10 };
}
