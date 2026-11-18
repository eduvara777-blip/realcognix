/**
 * Content rules shared by the API's Compliance Guard and the agents.
 * Keep this list conservative; legal should own and extend it.
 */
export const BANNED_CLAIMS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /guarantee(d)?\s+(returns?|rental|appreciation|profit)/i, reason: 'guaranteed returns claim' },
  { pattern: /assured\s+(returns?|rental|appreciation)/i, reason: 'assured returns claim' },
  { pattern: /risk[\s-]?free/i, reason: '"risk-free" claim' },
  { pattern: /double\s+your\s+(money|investment)/i, reason: '"double your money" claim' },
  { pattern: /100\s?%\s+(safe|returns?|guaranteed)/i, reason: '100% safe/returns claim' },
  { pattern: /\bno\s+rera\b|rera\s+not\s+required/i, reason: 'RERA disclaimer missing or denied' },
];

export function normalizeRera(s: string): string {
  return s.replace(/\s+/g, '').toUpperCase();
}

export function containsRera(text: string, reraNumber: string): boolean {
  return normalizeRera(text).includes(normalizeRera(reraNumber));
}

export interface ContentCheck {
  allowed: boolean;
  reasons: string[];
}

/** Ads, microsite pages and marketing broadcasts: need the RERA number and no banned claims. */
export function checkPromotionalContent(text: string, reraNumber: string | null | undefined): ContentCheck {
  const reasons: string[] = [];
  if (!reraNumber) reasons.push('project has no RERA number on file');
  else if (!containsRera(text, reraNumber)) reasons.push(`RERA number ${reraNumber} not shown in content`);
  reasons.push(...findBannedClaims(text));
  return { allowed: reasons.length === 0, reasons };
}

/** 1:1 messages: no banned claims (RERA not mandatory in a personal reply). */
export function findBannedClaims(text: string): string[] {
  return BANNED_CLAIMS.filter((b) => b.pattern.test(text)).map((b) => b.reason);
}

/** Opt-out keywords in English + common Indian-language replies. */
export const OPT_OUT_PATTERN = /^\s*(stop|unsubscribe|opt[\s-]?out|don'?t\s+(message|call)|band\s+karo|mat\s+bhejo|beda)\b/i;
