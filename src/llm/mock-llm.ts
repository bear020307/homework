import type { LLMClient, LLMMessage, LLMResponse } from "./llm-client.ts";

export interface MockLLMConfig {
  replies?: string[];
  respond?: (messages: LLMMessage[]) => string;
}

export class MockLLMClient implements LLMClient {
  private idx = 0;
  private replies: string[];
  private respond?: (messages: LLMMessage[]) => string;

  constructor(cfg: MockLLMConfig) {
    this.replies = cfg.replies ?? [];
    this.respond = cfg.respond;
  }

  async send(messages: LLMMessage[]): Promise<LLMResponse> {
    if (this.respond) return { content: this.respond(messages) };
    if (this.replies.length > 0) {
      const content = this.replies[Math.min(this.idx, this.replies.length - 1)];
      this.idx += 1;
      return { content };
    }
    return { content: "" };
  }
}