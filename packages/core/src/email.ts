const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/** Lowercase, trim; for Gmail strip dots and +tags so duplicates collapse. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const email = String(raw).trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return null;
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  if (!/^[^\s@]+$/.test(local) || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.split('+')[0]!.replace(/\./g, '');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}
