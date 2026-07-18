import { config } from "dotenv";
config();
import { ScanResult } from "./model.js";

export async function runScan(): Promise<ScanResult> {
  const { fetchSprintModel } = await import("./github.js");
  const { scoreRisks, forecast } = await import("./scoring.js");
  const model = await fetchSprintModel();
  return { model, findings: scoreRisks(model), forecast: forecast(model) };
}
