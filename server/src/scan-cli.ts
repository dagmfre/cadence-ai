/** `pnpm scan` — prints the scored sprint model; the Phase-1 exit check. */
import { runScan } from "./scan.js";

const { model, findings, forecast } = await runScan();
const { sprint } = model;

console.log(`\nSPRINT  "${sprint.title}" (#${sprint.number})  due ${sprint.dueOn?.slice(0, 10) ?? "—"}`);
console.log(`        ${sprint.closedCount} closed / ${sprint.openCount} open · closed last 7d: ${model.closedLast7Days}`);
console.log(`\nFORECAST  ${forecast.rag.toUpperCase()} · ${forecast.completionLikelihood}% likely · slip ~${forecast.projectedSlipDays}d · ${forecast.daysLeft}d left`);

console.log(`\nITEMS (${model.items.length})`);
for (const i of model.items)
  console.log(
    `  ${i.type === "pr" ? "PR" : "  "} #${String(i.number).padEnd(3)} ${i.state.padEnd(6)} ci:${i.ciStatus.padEnd(7)} board:${(i.boardStatus ?? "—").padEnd(11)} ${i.draft ? "DRAFT " : ""}${i.title.slice(0, 55)}`,
  );

console.log(`\nLOAD  reviewers: ${JSON.stringify(model.reviewerLoad)} · assignees: ${JSON.stringify(model.assigneeLoad)}`);

console.log(`\nRISK FINDINGS (${findings.length})`);
for (const f of findings)
  console.log(`  [${f.severity.toUpperCase().padEnd(6)}] #${String(f.itemNumber).padEnd(3)} ${f.category.padEnd(18)} ${f.reason}`);
console.log();
