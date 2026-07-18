import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/** Cadence mark: a leading beat dot + three ascending bars — rhythm and delivery velocity. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("size-5 text-primary", className)} aria-hidden>
      <circle cx="3.5" cy="17" r="2.5" fill="currentColor" />
      <rect x="9" y="12" width="3.4" height="9" rx="1.2" fill="currentColor" />
      <rect x="14.3" y="8" width="3.4" height="13" rx="1.2" fill="currentColor" opacity="0.8" />
      <rect x="19.6" y="3" width="3.4" height="18" rx="1.2" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

/** Clickable wordmark — always routes home. */
export function Logo({ to = "/", className }: { to?: string; className?: string }) {
  return (
    <Link
      to={to}
      className={cn("flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      aria-label="Cadence — go to overview"
    >
      <LogoMark className="transition-colors group-hover:text-primary" />
      <span className="text-[15px] font-semibold tracking-tight">Cadence</span>
    </Link>
  );
}
