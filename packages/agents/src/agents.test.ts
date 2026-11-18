import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DisabledLLM, type LLMProvider } from '@realcognix/adapters';
import { MemoryAgentStore } from './runtime.js';
import { runLeadQualifier } from './graphs/lead-qualifier.js';
import { runCreativeAgent } from './graphs/creative.js';

const project = { name: 'Shreeji Lakeview', locality: 'Whitefield', city: 'Bengaluru', priceMinInr: 8.9e6, priceMaxInr: 1.65e7, configurations: ['2 BHK', '3 BHK'] };

test('qualifier works with LLM disabled (rule fallback)', async () => {
  const store = new MemoryAgentStore();
  const deps = { llm: new DisabledLLM(), approvals: store, runs: store };
  const out = await runLeadQualifier(deps, {
    orgId: 'o', leadId: 'l', project, known: {}, questionsAsked: 0,
    lead: { name: 'Arjun Menon', hasValidPhone: true, hasEmail: false },
    transcript: [{ from: 'agent', text: 'Hi!' }, { from: 'lead', text: 'Looking for 3BHK around 1.2 Cr' }],
  });
  assert.equal(out.outcome, 'ask');
  assert.deepEqual(out.answers.bhk, [3]);
  assert.ok(out.answers.budgetMaxInr);
  assert.match(out.reply ?? '', /when|buy/i);
});

test('qualifier honours STOP', async () => {
  const store = new MemoryAgentStore();
  const out = await runLeadQualifier({ llm: new DisabledLLM(), approvals: store, runs: store }, {
    orgId: 'o', leadId: 'l', project, known: {}, questionsAsked: 0,
    lead: { hasValidPhone: true, hasEmail: false }, transcript: [{ from: 'lead', text: 'STOP' }],
  });
  assert.equal(out.outcome, 'opted_out');
});

test('creative agent enforces RERA and requests approval', async () => {
  const store = new MemoryAgentStore();
  const fake: LLMProvider = {
    name: 'fake',
    chat: async () => ({ text: '', model: 'fake' }),
    embed: async () => [],
    json: async (_m, schema) => ({
      data: schema.parse({ variants: [
        { angle: 'location', headline: 'Lake-view homes in Whitefield', primaryText: '2 & 3 BHK from ₹89 L*', description: 'Book a visit', cta: 'SIGN_UP' },
        { angle: 'invest', headline: 'Assured returns', primaryText: 'Assured returns of 12%', description: '', cta: 'SIGN_UP' },
      ] }),
      result: { text: '', model: 'fake' },
    }),
  };
  const out = await runCreativeAgent({ llm: fake, approvals: store, runs: store }, {
    orgId: 'o', projectId: 'p', persona: 'end_user', language: 'en', format: 'meta_single_image', count: 1,
    project: { name: 'Shreeji Lakeview', propertyType: 'apartment', city: 'Bengaluru', locality: 'Whitefield', priceFromInr: 8.9e6,
      configurations: ['2 BHK'], usps: ['lake view'], reraNumber: 'PRM/KA/RERA/1251/446/PR/000000/000001' },
  });
  assert.equal(out.variants.length, 1);
  assert.match(out.variants[0]!.primaryText, /RERA: PRM\/KA/);
  assert.equal(store.approvals.length, 1);
  assert.equal(store.approvals[0]!.kind, 'creative');
});
