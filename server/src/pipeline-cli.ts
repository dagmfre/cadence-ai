/**
 * `pnpm pipeline:dry` — runs the FULL agent pipeline and prints the drafted
 * ActionPlan WITHOUT applying anything. Zero GitHub/Slack mutations — safe to
 * run repeatedly, keeps the seeded repo pristine for the video.
 */
import "dotenv/config"; // must precede ./scan.js/pipeline (they import ./github.js which reads the token at load)
import { runScan } from "./scan.js";
import { runPipeline } from "./agents/pipeline.js";

const scan = await runScan();
console.log(`\nScan: ${scan.findings.length} deterministic findings · forecast ${scan.forecast.rag.toUpperCase()} ${scan.forecast.completionLikelihood}%`);
console.log("Running agent pipeline (Gemini)…\n");

const { findings, forecastNarrative, actionPlan } = await runPipeline(scan);

console.log("═══ ENRICHED RISK FINDINGS ═══");
for (const f of findings) {
  console.log(`\n#${f.itemNumber} [${f.severity}] ${f.category}`);
  console.log(`  reason:  ${f.reason}`);
  if (f.rootCause) console.log(`  cause:   ${f.rootCause}`);
  if (f.recommendedAction) console.log(`  action:  ${f.recommendedAction}`);
}

console.log("\n═══ FORECAST NARRATIVE ═══\n" + forecastNarrative);

console.log("\n═══ DRAFTED ACTION PLAN (not applied) ═══");
console.log("\nGitHub actions:");
for (const g of actionPlan.githubActions) console.log(`  ${g.kind.padEnd(7)} #${g.itemNumber}: ${g.value.slice(0, 120)}`);
console.log("\nOwner messages:");
for (const m of actionPlan.ownerMessages) console.log(`  @${m.githubLogin}: ${m.text.slice(0, 120)}`);
console.log("\nSlack report:\n" + actionPlan.slackReport);
console.log("\n(Nothing was applied. Real run = POST /run-daily-scan.)\n");
