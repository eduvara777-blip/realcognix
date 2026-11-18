/** Minimal {{placeholder}} rendering for cadence bodies and templates. Unknown keys render empty. */
export function renderTemplate(body: string, vars: Record<string, string | number | null | undefined>): string {
  return body
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
      const v = vars[key];
      return v === null || v === undefined ? '' : String(v);
    })
    .replace(/\\n/g, '\n');
}

export function formatInr(amount: number): string {
  if (amount >= 1e7) return `₹${(amount / 1e7).toFixed(2).replace(/\.00$/, '')} Cr`;
  if (amount >= 1e5) return `₹${(amount / 1e5).toFixed(1).replace(/\.0$/, '')} L`;
  return `₹${amount.toLocaleString('en-IN')}`;
}
