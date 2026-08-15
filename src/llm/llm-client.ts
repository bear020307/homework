export type LLMRole = "system" | "user" | "assistant";
export interface LLMMessage { role: LLMRole; content: string }
export interface LLMResponse { content: string }
export interface LLMOptions { timeoutMs?: number }
export interface LLMClient {
  send(messages: LLMMessage[], opts?: LLMOptions): Promise<LLMResponse>;
}