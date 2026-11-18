import type { z } from 'zod';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  /** Override the configured model alias for this call (e.g. 'groq' for a fast path). */
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResult {
  text: string;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
}

/**
 * Any LLM vendor. Business logic and agents only see this interface.
 * Default implementation speaks the OpenAI wire format to a LiteLLM proxy,
 * which in turn routes to Ollama (local), Gemini, Groq, OpenAI, Anthropic…
 */
export interface LLMProvider {
  readonly name: string;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult>;
  /** Ask for JSON and validate it against a zod schema (one repair retry). */
  json<S extends z.ZodType>(messages: ChatMessage[], schema: S, opts?: ChatOptions): Promise<{ data: z.infer<S>; result: ChatResult }>;
  embed(texts: string[], opts?: { model?: string }): Promise<number[][]>;
}
