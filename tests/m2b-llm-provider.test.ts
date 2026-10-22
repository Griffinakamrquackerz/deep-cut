import { describe, expect, it } from "vitest";
import { resolveLlmConfig } from "@/lib/ai";

describe("LLM provider config", () => {
  it("defaults to Groq's OpenAI-compatible free tier with a same-family fallback", () => {
    const cfg = resolveLlmConfig({});
    expect(cfg.provider).toBe("openai-compatible");
    expect(cfg.baseUrl).toBe("https://api.groq.com/openai/v1");
    expect(cfg.model).toBe("openai/gpt-oss-120b");
    // Quotas are per-model, so the chain is free headroom: each entry carries
    // its own allowance. Strongest first.
    // Chosen from what the key actually serves, not the docs' list — the
    // llama-3.x entries are documented but answer 404 on this account.
    expect(cfg.fallbackModels).toEqual([
      "openai/gpt-oss-20b",
      "qwen/qwen3.6-27b",
      "groq/compound-mini",
    ]);
  });

  it("never lists the primary model among its own fallbacks", () => {
    const cfg = resolveLlmConfig({ LLM_MODEL: "openai/gpt-oss-20b" });
    expect(cfg.fallbackModels).not.toContain("openai/gpt-oss-20b");
  });

  it("takes a comma-separated chain, and still honours the old singular var", () => {
    expect(
      resolveLlmConfig({ LLM_FALLBACK_MODELS: "a, b ,c" }).fallbackModels,
    ).toEqual(["a", "b", "c"]);
    expect(resolveLlmConfig({ LLM_FALLBACK_MODEL: "solo" }).fallbackModels).toEqual(["solo"]);
  });

  it("honors a custom OpenAI-compatible host and strips trailing slashes", () => {
    const cfg = resolveLlmConfig({
      LLM_BASE_URL: "https://openrouter.ai/api/v1//",
      LLM_MODEL: "deepseek/deepseek-chat-v3-0324:free",
      LLM_API_KEY: "k",
    });
    expect(cfg.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(cfg.model).toBe("deepseek/deepseek-chat-v3-0324:free");
    expect(cfg.apiKey).toBe("k");
  });

  it("supports the anthropic opt-in with its own key + default model", () => {
    const cfg = resolveLlmConfig({ LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "a" });
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.model).toBe("claude-sonnet-4-6");
    expect(cfg.apiKey).toBe("a");
  });

  it("lets LLM_MODEL override the anthropic default", () => {
    const cfg = resolveLlmConfig({ LLM_PROVIDER: "anthropic", LLM_MODEL: "claude-haiku-4-5" });
    expect(cfg.model).toBe("claude-haiku-4-5");
  });
});
