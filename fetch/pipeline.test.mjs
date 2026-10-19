import test from 'node:test'; import assert from 'node:assert/strict'; import { merge } from './pipeline.mjs';
const mk = (o = {}) => ({ title: 'Customer Support Associate', company: 'Acme', location: 'Remote - India', description: 'Permanent. Email support, escalation, Zendesk, CRM.', salaryText: '8 LPA', postedAt: new Date().toISOString(), applyUrl: 'https://acme.com/j/1?utm_source=a', sourceUrl: 'https://acme.com/j/1', source: 'T', ...o });
test('adds, dedupes, keeps firstSeen, closes removed, ignores failed source', () => {
  let r = merge([], { T: [mk(), mk(), mk({ title: 'Backend Engineer', applyUrl: 'https://acme.com/j/9' })] });
  assert.equal(r.jobs.length, 1); assert.equal(r.added.length, 1); assert.equal(r.jobs[0].eligibility, 'eligible');
  const first = r.jobs[0].firstSeen;
  r = merge(r.jobs, { T: [mk()] }, new Date(Date.now() + 864e5));
  assert.equal(r.added.length, 0); assert.equal(r.jobs[0].firstSeen, first);
  r = merge(r.jobs, { T: null }); assert.equal(r.jobs[0].closed, false); assert.equal(r.stats.T.ok, false);
  r = merge(r.jobs, { T: [] }); assert.equal(r.jobs[0].closed, true);
});
