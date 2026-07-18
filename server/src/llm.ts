/**
 * The model registry: one place that maps a model id to a provider and builds it,
 * so the pipeline and the chat agent can never disagree about what "the model" is.
 * Which models appear in the UI depends on which API keys the deployment actually has.
 */
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import { getWorkspace } from "./workspace.js";

export const MODELS = {
  "gemini-3.5-flash": { label: "Gemini 3.5 Flash", provider: "google", note: "Fast and cheap." },
  "gemini-2.5-flash": { label: "Gemini 2.5 Flash", provider: "google", note: "Older fallback." },
  "claude-sonnet-5": { label: "Claude Sonnet 5", provider: "anthropic", note: "Balanced — best default." },
  "claude-opus-4-8": { label: "Claude Opus 4.8", provider: "anthropic", note: "Most capable, slowest." },
  "claude-haiku-4-5-20251001": { label: "Claude Haiku 4.5", provider: "anthropic", note: "Fastest." },
} as const;

export type ModelId = keyof typeof MODELS;

const googleKey = () => process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
const hasKey = (provider: string) => (provider === "anthropic" ? !!process.env.ANTHROPIC_API_KEY : !!googleKey());

/** Never offer a model we have no key for — a dead option in a dropdown is a lie. */
export function availableModels() {
  return (Object.keys(MODELS) as ModelId[])
    .filter((id) => hasKey(MODELS[id].provider))
    .map((id) => ({ id, ...MODELS[id] }));
}

export const DEFAULT_MODEL: ModelId = (() => {
  const fromEnv = process.env.CADENCE_MODEL ?? process.env.GEMINI_MODEL;
  if (fromEnv && fromEnv in MODELS && hasKey(MODELS[fromEnv as ModelId].provider)) return fromEnv as ModelId;
  return availableModels()[0]?.id ?? "gemini-3.5-flash";
})();

export const resolveModel = (id?: string | null): ModelId =>
  id && id in MODELS && hasKey(MODELS[id as ModelId].provider) ? (id as ModelId) : DEFAULT_MODEL;

/**
 * A hard output cap is the difference between a poor answer and a dead run. Without it
 * a model that falls into a repetition loop runs all the way to its ceiling and truncates
 * the JSON mid-string, which no parser can recover from — one such run burned 69K tokens
 * over three minutes and returned nothing.
 */
const MAX_OUTPUT_TOKENS = 8192;

const cache = new Map<ModelId, BaseChatModel>();

export function llmFor(id: ModelId): BaseChatModel {
  const hit = cache.get(id);
  if (hit) return hit;
  const built =
    MODELS[id].provider === "anthropic"
      ? new ChatAnthropic({ model: id, apiKey: process.env.ANTHROPIC_API_KEY, temperature: 0.2, maxTokens: MAX_OUTPUT_TOKENS })
      : new ChatGoogleGenerativeAI({ model: id, apiKey: googleKey(), temperature: 0.2, maxOutputTokens: MAX_OUTPUT_TOKENS });
  cache.set(id, built);
  return built;
}

/** The model this workspace picked (Settings / the selector on Actions and Chat). */
export async function currentLlm(): Promise<BaseChatModel> {
  return llmFor(resolveModel((await getWorkspace()).model));
}
