import OpenAI from 'openai';
import type { z } from 'zod';
import { AdapterError } from '../errors.js';
import type { ChatMessage, ChatOptions, ChatResult, LLMProvider } from './types.js';

export interface OpenAICompatibleConfig {
  baseURL: string; // http://litellm:4000/v1 | http://ollama:11434/v1 | https://api.groq.com/openai/v1
  apiKey: string;
  model: string; // alias configured in LiteLLM (default | groq | gemini) or a raw model id
  embedModel: string;
  timeoutMs?: number;
}

export class OpenAICompatibleLLM implements LLMProvider {
  readonly name = 'openai_compatible';
  private readonly client: OpenAI;

  constructor(private readonly cfg: OpenAICompatibleConfig) {
    this.client = new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey, timeout: cfg.timeoutMs ?? 60_000, maxRetries: 2 });
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    return this.complete(messages, opts, false);
  }

  async json<S extends z.ZodType>(messages: ChatMessage[], schema: S, opts: ChatOptions = {}) {
    const first = await this.complete(messages, { temperature: 0, ...opts }, true);
    const parsed = tryParse(schema, first.text);
    if (parsed.ok) return { data: parsed.data as z.infer<S>, result: first };

    // One repair attempt: show the model its own output and the validation error.
    const repair = await this.complete(
      [
        ...messages,
        { role: 'assistant', content: first.text },
        { role: 'user', content: `That was not valid JSON for the required schema (${parsed.error}). Reply with corrected JSON only.` },
      ],
      { temperature: 0, ...opts },
      true,
    );
    const second = tryParse(schema, repair.text);
    if (!second.ok) throw new AdapterError(this.name, `LLM returned invalid JSON: ${second.error}`);
    return { data: second.data as z.infer<S>, result: repair };
  }

  async embed(texts: string[], opts: { model?: string } = {}): Promise<number[][]> {
    const res = await this.client.embeddings.create({ model: opts.model ?? this.cfg.embedModel, input: texts });
    return res.data.map((d) => d.embedding);
  }

  private async complete(messages: ChatMessage[], opts: ChatOptions, asJson: boolean): Promise<ChatResult> {
    const model = opts.model ?? this.cfg.model;
    try {
      const res = await this.client.chat.completions.create({
        model,
        messages,
        temperature: opts.temperature ?? 0.3,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        ...(asJson ? { response_format: { type: 'json_object' as const } } : {}),
      });
      return {
        text: res.choices[0]?.message?.content ?? '',
        model: res.model ?? model,
        tokensIn: res.usage?.prompt_tokens,
        tokensOut: res.usage?.completion_tokens,
      };
    } catch (err) {
      const status = (err as { status?: number }).status;
      throw new AdapterError(this.name, `chat completion failed for model "${model}": ${(err as Error).message}`, status);
    }
  }
}

function tryParse(schema: z.ZodType, text: string): { ok: true; data: unknown } | { ok: false; error: string } {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch (e) {
    return { ok: false, error: `JSON.parse: ${(e as Error).message}` };
  }
  const r = schema.safeParse(value);
  return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error.message.slice(0, 500) };
}
