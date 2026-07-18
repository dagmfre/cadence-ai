/**
 * Accounts & sessions (PRODUCT.md "Accounts & auth"). Deliberately small: email +
 * password, scrypt-hashed, session token in an httpOnly cookie, both persisted in
 * the same Redis store as everything else. One account owns one workspace today;
 * the keys are already namespaced so multi-workspace is a later switch.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { store } from "./store.js";
import { runWithWorkspace, setWorkspaceId } from "./context.js";

const scryptAsync = promisify(scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;
const COOKIE = "cadence_session";
const SESSION_DAYS = 30;

const CredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

async function hash(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scryptAsync(password, salt, 64)).toString("hex")}`;
}

async function verify(password: string, stored: string): Promise<boolean> {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const derived = await scryptAsync(password, salt, 64);
  const expected = Buffer.from(key, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** The signed-in user for this request, or null. */
export async function currentUser(req: FastifyRequest): Promise<{ email: string } | null> {
  const token = req.cookies[COOKIE];
  if (!token) return null;
  const session = await store.getSession(token);
  if (!session) return null;
  if (Date.parse(session.expiresAt) < Date.now()) {
    await store.deleteSession(token);
    return null;
  }
  return { email: session.email };
}

function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 86400,
  });
}

/**
 * The scheduler can't sign in, so it presents CRON_SECRET. Header is preferred
 * (query strings land in access logs); ?key= stays supported because some
 * schedulers only let you set a URL.
 */
export function isCronRequest(req: FastifyRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.authorization;
  if (header === `Bearer ${secret}`) return true;
  return (req.query as { key?: string } | undefined)?.key === secret;
}

/** Per-IP sliding window on the credential endpoints — blocks online brute force. */
const attempts = new Map<string, number[]>();
const WINDOW_MS = 5 * 60_000;
const MAX_ATTEMPTS = 10;

function rateLimited(req: FastifyRequest): boolean {
  const now = Date.now();
  const recent = (attempts.get(req.ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  attempts.set(req.ip, recent);
  if (attempts.size > 5_000) attempts.clear(); // crude bound; single instance
  return recent.length > MAX_ATTEMPTS;
}

const TOO_MANY = "Too many attempts — wait a few minutes and try again.";

export function registerAuth(app: FastifyInstance): void {
  /**
   * Guard every API route, and bind the request to the signed-in account's
   * workspace so one account can never read another's repo, runs or chat.
   * Static assets stay public; the cron trigger authenticates with CRON_SECRET
   * and deliberately runs headless (the .env workspace).
   */
  app.addHook("onRequest", (req, reply, done) => {
    // Enter the context first, then fill it in — see context.ts for why.
    runWithWorkspace(async () => {
      try {
        const url = req.url.split("?")[0] ?? "";
        const guarded = url.startsWith("/api/") || url.startsWith("/auth/github") || url.startsWith("/run-daily-scan");
        if (!guarded || url.startsWith("/api/auth/")) return done();

        if (url.startsWith("/run-daily-scan") && isCronRequest(req)) return done(); // headless scheduled run

        const user = await currentUser(req);
        if (!user) return reply.code(401).send({ error: "Not signed in" });
        setWorkspaceId(user.email);
        done();
      } catch (err) {
        // Without this, a store/network failure here escapes Fastify as an
        // unhandled rejection (process exit) and the request hangs forever.
        done(err as Error);
      }
    });
  });

  app.post("/api/auth/register", async (req, reply) => {
    if (rateLimited(req)) return reply.code(429).send({ error: TOO_MANY });
    const parsed = CredentialsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid details" });
    const { email, password } = parsed.data;

    if (await store.getUser(email))
      return reply.code(409).send({ error: "That email already has an account — sign in instead." });

    await store.setUser(email, { email, passwordHash: await hash(password), createdAt: new Date().toISOString() });
    const token = randomBytes(32).toString("hex");
    await store.setSession(token, { email, expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString() });
    setSessionCookie(reply, token);
    return { email };
  });

  app.post("/api/auth/login", async (req, reply) => {
    if (rateLimited(req)) return reply.code(429).send({ error: TOO_MANY });
    const parsed = CredentialsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter your email and password." });
    const { email, password } = parsed.data;

    const user = await store.getUser(email);
    if (!user || !(await verify(password, user.passwordHash)))
      return reply.code(401).send({ error: "Those details don't match an account." });

    const token = randomBytes(32).toString("hex");
    await store.setSession(token, { email, expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString() });
    setSessionCookie(reply, token);
    return { email };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const token = req.cookies[COOKIE];
    if (token) await store.deleteSession(token);
    reply.clearCookie(COOKIE, { path: "/" });
    return { signedOut: true };
  });

  /** The UI calls this on boot to decide between the auth screens and the app. */
  app.get("/api/auth/me", async (req) => ({ user: await currentUser(req) }));
}
