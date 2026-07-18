/**
 * `pnpm reset:slack` — clear Cadence's own Slack footprint before a recording:
 * the reports it posted to the channel and the DMs it sent to the team.
 *
 * A bot token can only delete messages the bot itself sent. Anything you or a
 * teammate typed — including "@Cadence why are we slipping?" — stays put, and the
 * output says how many were left behind. For a truly blank channel, make a new one.
 */
import "dotenv/config"; // must precede ./slack.js — it reads tokens at module load
import { deleteBotDms, deleteRecentBotMessages } from "./slack.js";

console.log("Channel:", await deleteRecentBotMessages());
console.log("DMs:    ", await deleteBotDms());
console.log("\nCadence's own messages are gone. Human messages can only be removed by hand.");
