import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoMark } from "@/components/Logo";
import { api, type AuthUser } from "@/lib/api";
import { cn } from "@/lib/utils";

type Mode = "login" | "register";

export default function Auth({ onSignedIn }: { onSignedIn: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const registering = mode === "register";
  const strength = password.length >= 12 ? "Strong" : password.length >= 8 ? "Good" : "Too short";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(registering ? await api.register(email, password) : await api.login(email, password));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  return (
    <div className="grid min-h-full place-items-center px-6 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-5 flex items-center justify-center gap-2">
          <LogoMark className="size-[22px]" />
          <span className="text-base font-semibold tracking-tight">Cadence</span>
        </div>

        <form onSubmit={submit} className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-base font-medium">{registering ? "Create your account" : "Sign in"}</h1>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">
            {registering
              ? "Then connect a repo, a board and a Slack channel. About two minutes."
              : "Pick up where your sprint left off."}
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!error}
              placeholder="you@company.com"
            />
          </div>

          <div className="mt-3.5 space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={registering ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={registering ? "pw-hint" : undefined}
            />
            {registering && password.length > 0 && (
              <p id="pw-hint" className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-secondary">
                  <span
                    className={cn(
                      "block h-full rounded-full transition-all",
                      password.length >= 12 ? "w-full bg-rag-green" : password.length >= 8 ? "w-2/3 bg-rag-amber" : "w-1/3 bg-rag-red",
                    )}
                  />
                </span>
                {strength} — {password.length} characters
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="mt-3 text-xs text-rag-red">
              {error}
            </p>
          )}

          <Button type="submit" className="mt-5 w-full" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {registering ? "Create account" : "Sign in"}
          </Button>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {registering ? "Already registered? " : "No account yet? "}
            <button
              type="button"
              onClick={() => switchMode(registering ? "login" : "register")}
              className="text-primary underline-offset-2 hover:underline"
            >
              {registering ? "Sign in" : "Create one"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
