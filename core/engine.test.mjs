import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.mjs';

test('canonicalUrl strips tracking, hash, www, trailing slash', () => {
  assert.equal(E.canonicalUrl('https://www.Example.com/jobs/1/?utm_source=x&gh_src=y#top'), 'https://example.com/jobs/1');
  assert.equal(E.canonicalUrl('javascript:alert(1)'), null);
  assert.equal(E.canonicalUrl('not a url'), null);
});

test('dedupe by URL and by company+similar title', () => {
  const a = { id: 1, company: 'Acme', title: 'Customer Support Associate', url: 'https://acme.com/j/1' };
  const sameUrl = { company: 'Other', title: 'x', url: 'https://www.acme.com/j/1?utm_medium=z' };
  const sameTitle = { company: 'acme', title: 'Customer Support Associate (Remote)', url: 'https://boards.x.com/9' };
  const diff = { company: 'Acme', title: 'Backend Engineer', url: 'https://acme.com/j/2' };
  assert.deepEqual(E.dedupe([a], [sameUrl, sameTitle, diff]), [diff]);
});

test('salary: in-hand vs CTC are never conflated', () => {
  assert.equal(E.classifySalary('₹50,000 per month in-hand').kind, 'verified_inhand');
  assert.equal(E.classifySalary('6 LPA').kind, 'gross_or_ctc');
  assert.equal(E.classifySalary('Competitive').kind, 'unknown');
  assert.equal(E.classifySalary('$40,000').kind, 'foreign_currency');
});

test('salaryFit: gross below minimum fails; gross above only needs verification', () => {
  assert.equal(E.salaryFit(E.classifySalary('4 LPA')), 'fail');      // ~33k/month gross
  assert.equal(E.salaryFit(E.classifySalary('8 LPA')), 'pass');
  assert.equal(E.salaryFit(E.classifySalary('5.5 LPA')), 'verify');
  assert.equal(E.salaryFit(E.classifySalary('₹40,000 in-hand')), 'fail');
  assert.equal(E.salaryFit(E.classifySalary('₹48,000 in-hand')), 'pass');
});

test('remote eligibility', () => {
  assert.equal(E.remoteEligibility('Remote - India').status, 'eligible');
  assert.equal(E.remoteEligibility('Remote worldwide').status, 'verify');
  assert.equal(E.remoteEligibility('Remote, US only').status, 'excluded');
  assert.equal(E.remoteEligibility('Hybrid, 3 days in office').status, 'excluded');
  assert.equal(E.remoteEligibility('Remote, excluding India').status, 'excluded');
});

test('education: mandatory degree excluded, equivalent route flagged', () => {
  assert.equal(E.educationCheck("Bachelor's degree required").status, 'excluded');
  assert.equal(E.educationCheck("Bachelor's degree or equivalent experience").status, 'review');
  assert.equal(E.educationCheck('Great communication skills').status, 'ok');
});

const good = { title: 'Customer Support Associate', company: 'Acme', location: 'Remote - India',
  description: 'Permanent full-time. Email support and escalation handling using Zendesk, CRM, Slack. Night shift.',
  salaryText: '₹52,000 per month in-hand', postedAt: new Date().toISOString() };

test('good job is eligible with high score and high confidence', () => {
  const r = E.scoreJob(good);
  assert.equal(r.eligibility, 'eligible');
  assert.equal(r.confidence, 'high');
  assert.ok(r.score >= 75, `score ${r.score}`);
});

test('hard failures are never hidden by a high score', () => {
  const r = E.scoreJob({ ...good, location: 'Remote, US only' });
  assert.equal(r.eligibility, 'excluded');
  assert.ok(r.hardFailures.length > 0);
});

test('software engineering jobs are excluded despite technical skills', () => {
  const r = E.scoreJob({ ...good, title: 'Backend Engineer' });
  assert.equal(r.eligibility, 'excluded');
});

test('unknown salary + unknown country goes to verification queue', () => {
  const r = E.scoreJob({ ...good, location: 'Remote', salaryText: '' });
  assert.equal(r.eligibility, 'verify');
});

test('contract roles are separated into verify', () => {
  const r = E.scoreJob({ ...good, description: good.description + ' This is a contract role.' });
  assert.equal(r.eligibility, 'verify');
});

test('state machine: valid, invalid, history, and no system-applied', () => {
  let app = { jobId: 1, status: 'New', history: [] };
  app = E.transition(app, 'Saved');
  app = E.transition(app, 'Applied', { at: '2026-10-18T00:00:00Z' });
  assert.equal(app.appliedAt, '2026-10-18T00:00:00Z');
  assert.equal(app.history.length, 2);
  assert.throws(() => E.transition(app, 'New'));
  assert.throws(() => E.transition({ status: 'Saved', history: [] }, 'Applied', { by: 'system' }), /Only the user/);
  assert.throws(() => E.transition({ status: 'Rejected', history: [] }, 'Interview'));
});

test('duplicate application prevention', () => {
  const apps = [{ jobId: 1, applyUrl: 'https://acme.com/j/1' }];
  assert.equal(E.canCreateApplication(apps, { id: 2, applyUrl: 'https://www.acme.com/j/1?utm_x=1' }), false);
  assert.equal(E.canCreateApplication(apps, { id: 3, applyUrl: 'https://acme.com/j/3' }), true);
});

test('strict matching: bad titles, senior experience, match %, buckets', () => {
  assert.ok(E.scoreJob(good).matchPct >= 80);
  assert.equal(E.scoreJob(good).bucket, 'inr');
  assert.equal(E.scoreJob({ ...good, title: 'AI Engineer' }).eligibility, 'excluded');
  assert.equal(E.scoreJob({ ...good, title: 'Senior Customer Support Lead' }).eligibility, 'excluded');
  assert.equal(E.scoreJob({ ...good, description: good.description + ' Requires 6+ years of experience.' }).eligibility, 'excluded');
  assert.equal(E.scoreJob({ ...good, salaryText: '$30,000 - $40,000' }).bucket, 'usd');
  assert.equal(E.scoreJob({ ...good, salaryText: '' }).bucket, 'unspecified');
  assert.ok(E.matchPct('Marketing Manager', 'brand campaigns') < 80);
});

test('salary ranges: top of range decides fail, bottom decides pass', () => {
  assert.equal(E.salaryFit(E.classifySalary('INR 4 - 6 LPA')), 'verify');
  assert.equal(E.salaryFit(E.classifySalary('7 - 9 LPA')), 'pass');
  assert.equal(E.salaryFit(E.classifySalary('3 - 4 LPA')), 'fail');
});
