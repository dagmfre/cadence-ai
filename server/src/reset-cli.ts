/** `pnpm reset:actions` — undo a real run (remove at-risk labels + Cadence comments + bot Slack posts). */
import "dotenv/config"; // must precede ./github.js — it reads the token at module load
import { undoActions } from "./github.js";
import { deleteRecentBotMessages } from "./slack.js";

const g = await undoActions();
const s = await deleteRecentBotMessages();
console.log("GitHub:", g.length ? g.join("; ") : "nothing to undo");
console.log("Slack: ", s);
console.log("Repo is demo-fresh again.");
