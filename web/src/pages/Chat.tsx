import { useEffect, useRef, useState } from "react";
import { Check, CornerDownLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, type ConvoMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

const SUGGESTIONS = ["Why are we slipping?", "Who is the bottleneck right now?", "What single action would help most?"];

export default function Chat() {
  const [messages, setMessages] = useState<ConvoMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.chat().then(setMessages).catch(() => {});
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, thinking]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || thinking) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: t, ts: new Date().toISOString() }]);
    setThinking(true);
    try {
      const { reply, proposedAction } = await api.chatSend(t);
      setMessages((m) => [...m, { role: "assistant", text: reply, ts: new Date().toISOString(), proposedAction }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: `Something went wrong: ${(e as Error).message}`, ts: new Date().toISOString() }]);
    } finally {
      setThinking(false);
    }
  };

  const confirm = async () => {
    setThinking(true);
    try {
      await api.chatConfirm();
      setMessages(await api.chat()); // server state marks the proposal executed
    } finally {
      setThinking(false);
    }
  };

  const lastProposalIdx = messages.findLastIndex((m) => m.proposedAction && !m.executed);

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <header>
        <h1 className="text-xl font-semibold">Chat</h1>
        <p className="mt-1 text-muted-foreground">
          Ask about the sprint — answers cite real items. Same agent as @Cadence in Slack.
        </p>
      </header>

      <div className="mt-6 flex-1 space-y-4 overflow-y-auto pr-1" role="log" aria-label="Conversation">
        {messages.length === 0 && !thinking && (
          <div className="mt-10 text-center">
            <p className="text-muted-foreground">Start with one of these:</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} variant="outline" size="sm" onClick={() => send(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("max-w-[75ch]", m.role === "user" && "ml-auto")}>
            <div
              className={cn(
                "whitespace-pre-wrap rounded-lg px-4 py-2.5 text-sm",
                m.role === "user" ? "bg-secondary" : "border border-border bg-card",
              )}
            >
              {m.text}
            </div>
            {m.proposedAction && (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-primary/40 bg-card px-4 py-2.5">
                <p className="text-sm">
                  <span className="text-muted-foreground">Proposed: </span>
                  <span className="font-medium">
                    {m.proposedAction.kind}{" "}
                    <span className="font-mono">
                      {m.proposedAction.kind === "dm" ? `@${m.proposedAction.githubLogin}` : `#${m.proposedAction.itemNumber}`}
                    </span>
                  </span>
                </p>
                {i === lastProposalIdx ? (
                  <Button size="sm" onClick={confirm} disabled={thinking}>
                    <Check className="size-3.5" aria-hidden />
                    Do it
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">{m.executed ? "applied" : "superseded"}</span>
                )}
              </div>
            )}
          </div>
        ))}
        {thinking && <p className="text-sm text-muted-foreground">Cadence is checking the sprint…</p>}
        <div ref={endRef} />
      </div>

      <form
        className="mt-4 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask about delivery risk…"
          rows={2}
          className="resize-none"
          aria-label="Message Cadence"
        />
        <Button type="submit" disabled={thinking || !input.trim()} aria-label="Send">
          <CornerDownLeft className="size-4" aria-hidden />
        </Button>
      </form>
    </div>
  );
}
