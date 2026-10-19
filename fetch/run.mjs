// Runs on GitHub Actions twice daily. Uses only public job feeds / ATS job-board APIs. No logins, no scraping of blocked sites.
import fs from 'node:fs'; import { merge, strip } from './pipeline.mjs';
const get = async (u, t = 'json') => { for (let i = 0; i < 2; i++) { try { const r = await fetch(u, { headers: { 'User-Agent': 'personal-job-finder' } }); if (!r.ok) throw new Error(r.status); return t === 'json' ? await r.json() : await r.text(); } catch (e) { if (i) throw e; await new Promise(r => setTimeout(r, 2000)); } } };
const adapters = {
  'Jobicy': async () => (await get('https://jobicy.com/api/v2/remote-jobs?count=50&tag=customer+support')).jobs.map(j => ({ title: j.jobTitle, company: j.companyName, location: `${j.jobGeo || ''} remote`, description: strip(j.jobDescription), salaryText: j.annualSalaryMin ? `${j.salaryCurrency || 'USD'} ${j.annualSalaryMin}-${j.annualSalaryMax}` : '', postedAt: j.pubDate, applyUrl: j.url, sourceUrl: j.url, source: 'Jobicy' })),
  'Remote OK': async () => (await get('https://remoteok.com/api')).slice(1).map(j => ({ title: j.position, company: j.company, location: j.location || 'Worldwide', description: strip(j.description) + ' remote', salaryText: j.salary_min ? `$${j.salary_min}-${j.salary_max}` : '', postedAt: j.date, applyUrl: j.apply_url || j.url, sourceUrl: j.url, source: 'Remote OK' })),
  'Remotive': async () => (await get('https://remotive.com/api/remote-jobs?category=customer-support')).jobs.map(j => ({ title: j.title, company: j.company_name, location: j.candidate_required_location + ' remote', description: strip(j.description), salaryText: j.salary || '', postedAt: j.publication_date, applyUrl: j.url, sourceUrl: j.url, source: 'Remotive' })),
  'We Work Remotely': async () => [...(await Promise.all(['remote-customer-support-jobs', 'remote-sales-and-marketing-jobs'].map(c => get(`https://weworkremotely.com/categories/${c}.rss`, 'text').catch(() => '')))).join('').matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, x]) => { const f = t => (x.match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`)) || [])[1] || ''; const [co, ...ti] = f('title').split(': '); return { title: ti.join(': ') || co, company: ti.length ? co : '', location: f('region') + ' remote', description: strip(f('description')), salaryText: '', postedAt: f('pubDate'), applyUrl: f('link'), sourceUrl: f('link'), source: 'We Work Remotely' }; }),
};
const cfg = JSON.parse(fs.readFileSync('config/companies.json', 'utf8')).companies;
for (const c of cfg) adapters[`${c.name} (${c.ats})`] = async () => {
  if (c.ats === 'greenhouse') return (await get(`https://boards-api.greenhouse.io/v1/boards/${c.token}/jobs?content=true`)).jobs.map(j => ({ title: j.title, company: c.name, location: j.location?.name || '', description: strip(j.content), salaryText: '', postedAt: j.updated_at, applyUrl: j.absolute_url, sourceUrl: j.absolute_url, source: `${c.name} (greenhouse)` }));
  if (c.ats === 'lever') return (await get(`https://api.lever.co/v0/postings/${c.token}?mode=json`)).map(j => ({ title: j.text, company: c.name, location: `${j.categories?.location || ''} ${j.workplaceType || ''}`, description: j.descriptionPlain || '', salaryText: '', postedAt: new Date(j.createdAt).toISOString(), applyUrl: j.hostedUrl, sourceUrl: j.hostedUrl, source: `${c.name} (lever)` }));
  if (c.ats === 'ashby') return (await get(`https://api.ashbyhq.com/posting-api/job-board/${c.token}`)).jobs.map(j => ({ title: j.title, company: c.name, location: `${j.location || ''} ${j.isRemote ? 'remote' : ''}`, description: j.descriptionPlain || '', salaryText: '', postedAt: j.publishedAt, applyUrl: j.jobUrl, sourceUrl: j.jobUrl, source: `${c.name} (ashby)` }));
};
const file = 'docs/data/jobs.json', old = JSON.parse(fs.readFileSync(file, 'utf8'));
const batches = {};
for (const [n, f] of Object.entries(adapters)) { try { batches[n] = await f(); } catch (e) { console.error(n, 'failed:', e.message); batches[n] = null; } }
const { jobs, stats, added } = merge(old.jobs, batches);
fs.writeFileSync(file, JSON.stringify({ updated: new Date().toISOString(), stats: { ...old.stats, ...stats }, jobs }, null, 1));
console.log(`new relevant jobs: ${added.length}`);
const fresh = added.filter(j => j.eligibility === 'eligible');
if (fresh.length && process.env.RESEND_API_KEY && process.env.EMAIL_TO) {
  const html = fresh.slice(0, 20).map(j => `<p><b>${j.title}</b> - ${j.company}<br>Score ${j.score} | ${j.salary.evidence}<br><a href="${j.applyUrl}">Open application</a></p>`).join('');
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'Job Finder <onboarding@resend.dev>', to: process.env.EMAIL_TO, subject: `${fresh.length} new matching remote jobs`, html }) });
  console.log('email status', r.status);
}
