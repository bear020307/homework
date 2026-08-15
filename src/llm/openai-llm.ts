import type { LLMClient, LLMMessage, LLMOptions, LLMResponse } from "./llm-client.ts";

export interface OpenAILLMConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  defaultTimeoutMs?: number;
}

export class OpenAILLMClient implements LLMClient {
  private baseURL: string;
  private cfg: OpenAILLMConfig;
  constructor(cfg: OpenAILLMConfig) {
    this.cfg = cfg;
    this.baseURL = (cfg.baseURL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  }

  async send(messages: LLMMessage[], opts?: LLMOptions): Promise<LLMResponse> {
    const timeoutMs = opts?.timeoutMs ?? this.cfg.defaultTimeoutMs ?? 60_000;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify({ model: this.cfg.model, messages }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`LLM HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return { content: data.choices?.[0]?.message?.content ?? "" };
    } finally {
      clearTimeout(timer);
    }
  }
}