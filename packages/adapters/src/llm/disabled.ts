import type { LLMProvider } from './types.js';
import { AdapterError } from '../errors.js';

/** Used when LLM_PROVIDER=none: callers must fall back to rules. */
export class DisabledLLM implements LLMProvider {
  readonly name = 'none';
  async chat(): Promise<never> {
    throw new AdapterError(this.name, 'LLM disabled (LLM_PROVIDER=none)');
  }
  async json(): Promise<never> {
    throw new AdapterError(this.name, 'LLM disabled (LLM_PROVIDER=none)');
  }
  async embed(): Promise<never> {
    throw new AdapterError(this.name, 'LLM disabled (LLM_PROVIDER=none)');
  }
}
