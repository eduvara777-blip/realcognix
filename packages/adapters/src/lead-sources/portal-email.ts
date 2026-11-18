import type { LeadSourceKind, NormalizedLead } from '@realcognix/core';
import type { LeadSource } from './types.js';

export interface PortalEmail {
  from: string;
  subject: string;
  text?: string;
  html?: string;
  receivedAt?: string;
  messageId?: string;
}

const PORTALS: Array<{ kind: LeadSourceKind; match: RegExp }> = [
  { kind: 'portal_99acres', match: /99acres/i },
  { kind: 'portal_magicbricks', match: /magicbricks/i },
  { kind: 'portal_housing', match: /housing\.com/i },
  { kind: 'portal_nobroker', match: /nobroker/i },
];

/**
 * STUB: portal lead-notification emails (99acres, MagicBricks, Housing.com, NoBroker).
 * Uses a generic "Label: value" extractor plus phone/email regexes. Real templates differ per portal and change
 * often — collect 5–10 real samples per portal and add a dedicated extractor (or use the LLM extraction fallback).
 */
export class PortalEmailSource implements LeadSource<PortalEmail> {
  readonly kind = 'portal_email' as const;

  async parse(mail: PortalEmail): Promise<NormalizedLead[]> {
    const kind = PORTALS.find((p) => p.match.test(mail.from) || p.match.test(mail.subject))?.kind ?? 'portal_other';
    const text = mail.text ?? htmlToText(mail.html ?? '');
    const fields = extractLabelled(text);
    const get = (...labels: string[]) => labels.map((l) => fields.get(l)).find(Boolean);

    const phone = get('mobile', 'phone', 'contact number', 'mobile number', 'phone number') ?? text.match(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/)?.[0];
    const email = get('email', 'email id', 'e-mail') ?? text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0];
    if (!phone && !email) return [];

    return [{
      sourceKind: kind,
      externalId: mail.messageId,
      fullName: get('name', 'buyer name', 'customer name', 'contact name'),
      phone,
      email,
      city: get('city', 'location'),
      projectHint: get('project', 'property', 'project name', 'listing') ?? mail.subject,
      budgetText: get('budget', 'price range'),
      bhkText: get('bhk', 'configuration', 'property type'),
      message: get('message', 'requirement', 'comments'),
      // Portals collect their own consent for the enquiry; we record a transactional basis only.
      consents: [
        { channel: 'call', purpose: 'calls', source: kind },
        { channel: 'email', purpose: 'transactional', source: kind },
        { channel: 'whatsapp', purpose: 'transactional', source: kind },
      ],
      receivedAt: mail.receivedAt ?? new Date().toISOString(),
      raw: { from: mail.from, subject: mail.subject },
    }];
  }
}

function extractLabelled(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z .\-/]{1,30}?)\s*[:\-–]\s*(.+?)\s*$/);
    if (m && m[1] && m[2]) out.set(m[1].toLowerCase().trim(), m[2]);
  }
  return out;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(br|\/p|\/tr|\/div)[^>]*>/gi, '\n')
    .replace(/<\/td>\s*<td[^>]*>/gi, ': ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
