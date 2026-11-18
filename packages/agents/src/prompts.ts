import { readFileSync } from 'node:fs';
import { renderTemplate } from '@realcognix/core';

/**
 * Prompts live as Markdown in packages/agents/prompts so non-engineers can edit them.
 * Resolved relative to this module: works from both src/ (tsx) and dist/ (node).
 */
const cache = new Map<string, string>();

export type PromptName =
  | 'lead-qualifier.extract'
  | 'lead-qualifier.ask'
  | 'follow-up.draft'
  | 'reporting.narrative'
  | 'creative.variants';

export function loadPrompt(name: PromptName): string {
  let text = cache.get(name);
  if (!text) {
    text = readFileSync(new URL(`../prompts/${name}.md`, import.meta.url), 'utf8');
    cache.set(name, text);
  }
  return text;
}

export function prompt(name: PromptName, vars: Record<string, string | number | null | undefined> = {}): string {
  return renderTemplate(loadPrompt(name), vars);
}
