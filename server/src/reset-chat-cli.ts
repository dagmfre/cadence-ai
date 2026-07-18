/**
 * `pnpm reset:chat` — clear the conversation history of the headless workspace
 * (the one the Slack listener and the cron scan act on).
 *
 * This cannot reach a signed-in account's chat: those live under that account's own
 * workspace key, and a CLI has no session. Use the "New chat" button on the dashboard
 * for those — or sign up fresh, which is what the demo does anyway.
 */
import "dotenv/config";
import { store } from "./store.js";

const ids = await store.listConvoIds();
if (!ids.length) console.log("No conversations recorded in the headless workspace.");
for (const id of ids) {
  const before = (await store.getConvo(id)).length;
  await store.setConvo(id, []);
  console.log(`  cleared ${id} (${before} message${before === 1 ? "" : "s"})`);
}
console.log("\nHeadless chat history is empty. Signed-in accounts: use “New chat” on the dashboard.");
