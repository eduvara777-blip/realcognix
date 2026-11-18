import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { PortalEmailSource } from './lead-sources/portal-email.js';
import { mapGraphLead } from './lead-sources/meta-lead-ads.js';
import { WhatsAppCloudChannel, verifyMetaSignature } from './messaging/whatsapp-cloud.js';

test('portal email stub extracts labelled fields', async () => {
  const leads = await new PortalEmailSource().parse({
    from: 'alerts@99acres.com',
    subject: 'New enquiry for Shreeji Lakeview',
    text: 'Name: Rohit Gupta\nMobile: +91-98450 00009\nEmail: rohit@example.com\nBudget: 1.2 Cr - 1.5 Cr\n',
  });
  assert.equal(leads.length, 1);
  assert.equal(leads[0]!.sourceKind, 'portal_99acres');
  assert.equal(leads[0]!.fullName, 'Rohit Gupta');
  assert.equal(leads[0]!.email, 'rohit@example.com');
});

test('meta graph lead maps field_data', () => {
  const l = mapGraphLead({
    id: 'L1', created_time: '2026-11-17T06:00:00+0000', form_id: 'F1',
    field_data: [{ name: 'full_name', values: ['Arjun Menon'] }, { name: 'phone_number', values: ['+919845000001'] }],
  });
  assert.equal(l.fullName, 'Arjun Menon');
  assert.equal(l.sourceRef, 'F1');
});

test('whatsapp webhook parsing + signature', () => {
  const ch = new WhatsAppCloudChannel({ phoneNumberId: '1', accessToken: 't', verifyToken: 'v', graphVersion: 'v21.0', defaultLanguage: 'en' });
  const body = { entry: [{ id: 'x', changes: [{ field: 'messages', value: {
    contacts: [{ wa_id: '919845000001', profile: { name: 'Arjun' } }],
    messages: [{ from: '919845000001', id: 'wamid.1', timestamp: '1763359200', type: 'text', text: { body: '3BHK, 1.2 Cr' } }],
  } }] }] };
  const ev = ch.parseWebhook({ headers: {}, body });
  assert.equal(ev[0]?.type, 'message');
  assert.equal(ev[0]?.type === 'message' && ev[0].from, '+919845000001');
  const raw = JSON.stringify(body);
  const sig = `sha256=${createHmac('sha256', 's3cret').update(raw).digest('hex')}`;
  assert.equal(verifyMetaSignature('s3cret', { headers: { 'x-hub-signature-256': sig }, rawBody: raw, body }), true);
  assert.equal(verifyMetaSignature('wrong', { headers: { 'x-hub-signature-256': sig }, rawBody: raw, body }), false);
});
