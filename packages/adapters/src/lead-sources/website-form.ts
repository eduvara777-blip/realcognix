import { z } from 'zod';
import type { NormalizedLead } from '@realcognix/core';
import type { LeadSource } from './types.js';

/** Payload posted by microsites / client websites (see apps/web or any HTML form). */
export const WebsiteFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(8).max(20),
  email: z.string().trim().email().optional().or(z.literal('')),
  city: z.string().max(80).optional(),
  message: z.string().max(2000).optional(),
  budget: z.string().max(60).optional(),
  bhk: z.string().max(30).optional(),
  language: z.string().max(5).optional(),
  // DPDP: the form must show a notice and capture explicit opt-ins
  consent_whatsapp: z.coerce.boolean().default(false),
  consent_marketing: z.coerce.boolean().default(false),
  consent_calls: z.coerce.boolean().default(true),
  notice_version: z.string().default('v1'),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  gclid: z.string().optional(),
  fbclid: z.string().optional(),
  // honeypot: bots fill hidden fields
  website: z.string().max(0).optional(),
});

export type WebsiteFormInput = { body: unknown; ip?: string; userAgent?: string; formKey?: string };

export class WebsiteFormSource implements LeadSource<WebsiteFormInput> {
  readonly kind = 'website_form' as const;

  async parse(input: WebsiteFormInput): Promise<NormalizedLead[]> {
    const d = WebsiteFormSchema.parse(input.body);
    const evidence = { ip: input.ip, userAgent: input.userAgent };
    const consents: NonNullable<NormalizedLead['consents']> = [
      { channel: 'whatsapp', purpose: 'transactional', source: 'website_form', noticeVersion: d.notice_version },
      { channel: 'email', purpose: 'transactional', source: 'website_form', noticeVersion: d.notice_version },
    ];
    if (d.consent_whatsapp) consents.push({ channel: 'whatsapp', purpose: 'marketing', source: 'website_form', noticeVersion: d.notice_version });
    if (d.consent_marketing) consents.push({ channel: 'email', purpose: 'marketing', source: 'website_form', noticeVersion: d.notice_version });
    if (d.consent_calls) consents.push({ channel: 'call', purpose: 'calls', source: 'website_form', noticeVersion: d.notice_version });

    const utm = Object.fromEntries(
      Object.entries({ utm_source: d.utm_source, utm_medium: d.utm_medium, utm_campaign: d.utm_campaign, utm_content: d.utm_content, gclid: d.gclid, fbclid: d.fbclid })
        .filter(([, v]) => !!v),
    ) as Record<string, string>;

    return [{
      sourceKind: 'website_form',
      sourceRef: input.formKey,
      fullName: d.name,
      phone: d.phone,
      email: d.email || undefined,
      city: d.city,
      message: d.message,
      budgetText: d.budget,
      bhkText: d.bhk,
      preferredLanguage: d.language,
      utm,
      consents,
      receivedAt: new Date().toISOString(),
      raw: { ...d, evidence },
    }];
  }
}
