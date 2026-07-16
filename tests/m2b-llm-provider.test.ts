import { describe, expect, it } from "vitest";
import { resolveLlmConfig } from "@/lib/ai";

describe("LLM provider config", () => {
  it("defaults to Groq's OpenAI-compatible free tier", () => {
    const cfg = resolveLlmConfig({});
    expect(cfg.provider).toBe("openai-compatible");
    expect(cfg.baseUrl).toBe("https://api.groq.com/openai/v1");
    expect(cfg.model).toBe("llama-3.3-70b-versatile");
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
