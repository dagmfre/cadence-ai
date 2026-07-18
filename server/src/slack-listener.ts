/**
 * Slack Socket Mode listener (PRODUCT_FLOWS W3, DECISIONS §6): the Slack half of
 * the conversational agent. @Cadence mentions (channel/thread) and bot DMs run
 * the same runConvo as web chat; each thread is its own conversation
 * (convoId = thread_ts, D15). Ack fast, reply when Gemini is done.
 */
import { SocketModeClient } from "@slack/socket-mode";
import { runConvo } from "./agents/convo.js";
import { getSlackWeb } from "./slack.js";

interface SlackEvent {
  type: string;
  text?: string;
  channel: string;
  ts: string;
  thread_ts?: string;
  user?: string;
  bot_id?: string;
  channel_type?: string;
}

export async function startSlackListener(): Promise<void> {
  const appToken = process.env.SLACK_APP_TOKEN;
  const web = await getSlackWeb();
  if (!appToken || !web) {
    console.warn("⚠ SLACK_APP_TOKEN missing — Slack conversational listener disabled.");
    return;
  }
  const me = (await web.auth.test()).user_id as string;
  const smc = new SocketModeClient({ appToken });

  smc.on("slack_event", async ({ ack, body }: { ack: () => Promise<void>; body: { event?: SlackEvent } }) => {
    // Everything runs inside try/catch: an unhandled rejection here would kill the process.
    let ev: SlackEvent | undefined;
    let dm = false;
    let threadTs = "";
    try {
      await ack(); // within 3s, before the slow Gemini work
      ev = body.event;
      if (!ev || ev.bot_id || ev.user === me) return; // never answer ourselves

      const mention = ev.type === "app_mention";
      dm = ev.type === "message" && ev.channel_type === "im";
      if (!mention && !dm) return;

      const text = (ev.text ?? "").replace(new RegExp(`<@${me}>`, "g"), "").trim();
      if (!text) return;
      // Thread = one conversation; DM = one rolling conversation per DM channel.
      threadTs = ev.thread_ts ?? ev.ts;
      const convoId = dm ? `im-${ev.channel}` : threadTs;

      const { reply, proposedAction } = await runConvo(convoId, text);
      const suffix = proposedAction ? "\n\n_Reply “do it” to apply._" : "";
      await web.chat.postMessage({
        channel: ev.channel,
        text: reply + suffix,
        ...(dm ? {} : { thread_ts: threadTs }),
        unfurl_links: false,
      });
    } catch (e) {
      console.error("slack convo failed:", e);
      if (ev)
        await web.chat
          .postMessage({ channel: ev.channel, text: "I hit an error answering that — try me again.", ...(dm ? {} : { thread_ts: threadTs }) })
          .catch(() => {});
    }
  });

  // An 'error' emit with no listener throws on an EventEmitter — this keeps a
  // socket blip from taking the server down.
  smc.on("error", (e: unknown) => console.error("slack socket error:", e));
  smc.on("disconnected", () => console.warn("slack socket disconnected — reconnecting"));

  await smc.start();
  console.log("Slack Socket Mode listener connected.");
}
