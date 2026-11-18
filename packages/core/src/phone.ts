/**
 * Phone normalisation tuned for Indian leads.
 * Portals and forms send "098450 00001", "91-9845000001", "+91 98450 00001", "9845000001".
 * All of those become "+919845000001". International numbers with a leading + or 00 are kept (NRI buyers).
 */
const INDIAN_MOBILE = /^[6-9]\d{9}$/;

export function normalizePhone(raw: string | null | undefined, defaultCountry: 'IN' = 'IN'): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (!hasPlus && digits.startsWith('00')) {
    // 00-prefixed international dialling
    digits = digits.slice(2);
    return validE164(`+${digits}`);
  }
  if (hasPlus) {
    return validE164(`+${digits}`);
  }

  if (defaultCountry === 'IN') {
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1); // trunk prefix
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    if (digits.length === 13 && digits.startsWith('091')) digits = digits.slice(3);
    if (INDIAN_MOBILE.test(digits)) return `+91${digits}`;
    // Landline with STD code (e.g. 080XXXXXXXX -> +9180XXXXXXXX)
    if (digits.length === 10 && /^[1-5]/.test(digits)) return `+91${digits}`;
  }
  return null;
}

function validE164(value: string): string | null {
  if (!/^\+[1-9]\d{7,14}$/.test(value)) return null;
  if (value.startsWith('+91')) {
    const national = value.slice(3);
    if (national.length !== 10) return null;
  }
  return value;
}

export function isIndianMobile(e164: string | null | undefined): boolean {
  return !!e164 && e164.startsWith('+91') && INDIAN_MOBILE.test(e164.slice(3));
}

/** WhatsApp Cloud API wants the number without '+'. */
export function toWhatsAppId(e164: string): string {
  return e164.replace(/^\+/, '');
}
