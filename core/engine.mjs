// Core decision engine for Harsh Remote Job Finder. Pure functions, no I/O, no dependencies.
export const MIN_INHAND_MONTHLY = 45000;

// ---------- URL canonicalisation & dedup ----------
const TRACKING = /^(utm_|gh_src$|gh_jid$|ref$|source$|src$|lever-source|fbclid$|gclid$)/i;
export function canonicalUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  u.hash = '';
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  [...u.searchParams.keys()].forEach(k => TRACKING.test(k) && u.searchParams.delete(k));
  u.searchParams.sort();
  const path = u.pathname.replace(/\/+$/, '') || '/';
  const qs = u.searchParams.toString();
  return `${u.protocol}//${u.hostname}${path}${qs ? '?' + qs : ''}`;
}
const NOISE = new Set(['remote', 'india', 'wfh', 'night', 'shift', 'fulltime', 'full', 'time', 'permanent', 'hiring', 'urgent', 'work', 'from', 'home']);
const tokens = s => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !NOISE.has(w)));
export function titleSimilarity(a, b) {
  const A = tokens(a), B = tokens(b);
  const inter = [...A].filter(x => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 0;
}
export function isDuplicate(a, b) {
  const ca = canonicalUrl(a.applyUrl || a.url), cb = canonicalUrl(b.applyUrl || b.url);
  if (ca && cb && ca === cb) return true;
  const sameCo = String(a.company).trim().toLowerCase() === String(b.company).trim().toLowerCase();
  return sameCo && titleSimilarity(a.title, b.title) >= 0.85;
}
export function dedupe(existing, incoming) {
  const fresh = [];
  for (const j of incoming) {
    if (![...existing, ...fresh].some(x => isDuplicate(x, j))) fresh.push(j);
  }
  return fresh;
}

// ---------- Salary ----------
const num = s => Number(String(s).replace(/,/g, ''));
export function classifySalary(text = '') {
  const t = String(text).toLowerCase();
  if (!/\d/.test(t)) return { kind: 'unknown', monthlyInr: null, evidence: 'No salary stated' };
  let m;
  const inhand = /in[- ]?hand|take[- ]?home/.test(t);
  if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:-|to)?\s*(\d+(?:\.\d+)?)?\s*(?:lpa|lakhs?)/))) {
    const lo = Number(m[1]) * 100000, hi = m[2] ? Number(m[2]) * 100000 : lo;
    return { kind: 'gross_or_ctc', monthlyInr: Math.round(hi / 12), lowMonthlyInr: m[2] ? Math.round(lo / 12) : undefined, evidence: `${m[0]} (annual CTC/gross; in-hand not derivable)` };
  }
  if ((m = t.match(/(?:₹|\brs\.?|\binr)\s*([\d,]+)(k)?/))) {
    let v = num(m[1]) * (m[2] ? 1000 : 1);
    const annual = /per (year|annum)|annual|\/yr|pa\b|ctc/.test(t) || v >= 300000;
    const monthly = annual ? Math.round(v / 12) : v;
    if (inhand) return { kind: 'verified_inhand', monthlyInr: monthly, evidence: m[0] + ' (stated in-hand)' };
    return { kind: 'gross_or_ctc', monthlyInr: monthly, evidence: m[0] + ' (gross/CTC unless stated in-hand)' };
  }
  if (/\$|usd|eur|£/.test(t)) return { kind: 'foreign_currency', monthlyInr: null, evidence: String(text).trim().slice(0, 60) + ' (not converted to INR)' };
  return { kind: 'unknown', monthlyInr: null, evidence: 'Unparseable salary' };
}
// In-hand can never exceed gross, so gross < minimum is a hard fail; gross >= minimum is only "uncertain".
export function salaryFit(s, min = MIN_INHAND_MONTHLY) {
  if (s.kind === 'verified_inhand') return s.monthlyInr >= min ? 'pass' : 'fail';
  if (s.kind === 'gross_or_ctc') return s.monthlyInr < min ? 'fail' : (s.lowMonthlyInr ?? s.monthlyInr) >= 50000 ? 'pass' : 'verify'; // user rule: 6 LPA ~ 45k in-hand
  return 'verify';
}

// ---------- Remote / education / employment ----------
export function remoteEligibility(text = '') {
  const t = text.toLowerCase();
  if (/hybrid|on-?site|in[- ]office|office[- ]based|relocat/.test(t) && !/fully remote|100% remote/.test(t))
    return { status: 'excluded', evidence: 'Hybrid/on-site/office-based' };
  if (/(us|u\.s\.|united states|uk|eu|europe|canada)[- ]only|must (reside|be located|be based) in (the )?(us|united states|uk|eu|canada)|(excluding|except|not (open|available) (to|in)) india/.test(t))
    return { status: 'excluded', evidence: 'Restricted to another region or excludes India' };
  if (/remote/.test(t) && /\bindia\b/.test(t)) return { status: 'eligible', evidence: 'Remote with India explicitly mentioned' };
  if (/remote|work from home|wfh/.test(t)) return { status: 'verify', evidence: 'Remote, but India eligibility not confirmed' };
  return { status: 'verify', evidence: 'Work arrangement unclear' };
}
export function educationCheck(text = '') {
  const t = text.toLowerCase();
  const degree = /(bachelor|graduat|b\.?(tech|sc|com|a)\b|degree)/.test(t);
  if (!degree) return { status: 'ok', evidence: 'No degree requirement found' };
  const flexible = /or equivalent|equivalent (experience|qualification)|or diploma|preferred|nice to have|desirable|or relevant experience/.test(t);
  const mandatory = /(required|mandatory|must (have|hold)|minimum)/.test(t);
  if (flexible) return { status: 'review', evidence: 'Degree mentioned with an equivalent route or as preferred' };
  return mandatory ? { status: 'excluded', evidence: 'Completed degree appears mandatory' }
                   : { status: 'review', evidence: 'Degree mentioned; unclear whether mandatory' };
}
export function employmentType(text = '') {
  const t = text.toLowerCase();
  if (/commission[- ]only/.test(t)) return 'commission_only';
  if (/contract|freelance|temporary|project[- ]based|\bc2c\b/.test(t)) return 'contract';
  if (/permanent|full[- ]time/.test(t)) return 'permanent';
  return 'unknown';
}

// ---------- Matching ----------
const ROLE_TERMS = ['customer support', 'customer success', 'client services', 'client operations', 'support associate', 'support specialist',
  'support executive', 'email support', 'escalation', 'payments support', 'financial operations', 'fintech', 'revenue operations', 'sales support', 'technical support', 'saas support'];
const SKILLS = ['zendesk', 'zoho', 'crm', 'slack', 'google workspace', 'microsoft office', 'email', 'escalation', 'reporting', 'saas', 'payments', 'excel'];
const NOT_SUPPORT = /(software|backend|front-?end|full[- ]?stack|devops|data) (engineer|developer)|\bsde\b/;

export function categorise(title = '', desc = '') {
  const t = `${title} ${desc}`.toLowerCase();
  if (/fintech|payment|financial|finance|banking|lending/.test(t)) return 'A_fintech_ops';
  if (/customer success|client (success|operations|services)|account/.test(t)) return 'B_customer_success';
  if (/technical support|saas|api|troubleshoot|l2|support engineer/.test(t)) return 'C_technical_support';
  if (/sales support|revenue operations|revops|sales operations/.test(t)) return 'D_sales_revops';
  return 'B_customer_success';
}

const TITLE_OK = /customer (support|service|success|care|experience|operations)|client (support|services|success|operations)|support (associate|specialist|executive|representative|agent|analyst)|(technical|product|saas|email|chat|payments?|billing|merchant) support|help ?desk|service desk|(financial|finance|payments?|fintech) operations|revenue operations|sales (support|operations)|onboarding (specialist|associate)|account (support|coordinator)|operations (associate|analyst|executive)|escalation/i;
const TITLE_BAD = /\b(ai|ml|machine learning|data scientist|data engineer|software|developer|engineer|devops|sre|architect|tech lead|team lead|lead|head|director|vp|principal|staff|chief|senior|sr\.?|manager of)\b/i;
const SKILL_GROUPS = [/zendesk|freshdesk|zoho|intercom|help ?desk|ticket/, /\bcrm\b|salesforce|hubspot/, /slack|google workspace|microsoft office|excel|sheets/, /e-?mail|chat|phone|calls?\b/, /escalat/, /saas/, /payment|billing|refund|invoice|fintech|financial|banking|lending/, /report/];
// Profile match %: 70 if the TITLE is a target role, +6 per skill/tool group found, +3 per role phrase (max 3). Keyword-based estimate.
export function matchPct(title = '', desc = '') {
  const d = `${title} ${desc}`.toLowerCase();
  const hits = SKILL_GROUPS.filter(r => r.test(d)).length;
  const roleHits = ROLE_TERMS.filter(r => d.includes(r)).length;
  const base = TITLE_OK.test(title) ? 70 : roleHits >= 3 ? 45 : 0;
  return Math.min(100, base + hits * 6 + Math.min(roleHits, 3) * 3);
}
export function minYears(text = '') {
  const m = [...String(text).toLowerCase().matchAll(/(\d{1,2})\s*(?:\+|-\s*\d{1,2}|to\s*\d{1,2})?\s*(?:years|yrs)(?:\W+\w+){0,5}\W+experience/g)].map(x => +x[1]);
  return m.length ? Math.min(...m) : 0;
}
export function scoreJob(job, now = new Date(), min = MIN_INHAND_MONTHLY) {
  const text = `${job.title} ${job.description || ''}`;
  const salary = classifySalary(job.salaryText);
  const remote = remoteEligibility(`${job.location || ''} ${text}`);
  const edu = educationCheck(job.description || '');
  const emp = employmentType(text);
  const fit = salaryFit(salary, min);
  const lower = text.toLowerCase();

  const roleHits = ROLE_TERMS.filter(r => lower.includes(r));
  const swEng = NOT_SUPPORT.test(String(job.title).toLowerCase());
  const role = swEng ? 0 : Math.min(30, roleHits.length ? 18 + roleHits.length * 4 : 6);
  const skillHits = SKILLS.filter(s => lower.includes(s));
  const skills = Math.min(20, skillHits.length * 5);
  const comp = fit === 'pass' ? (salary.kind === 'verified_inhand' ? 20 : 16) : fit === 'verify' ? (salary.kind === 'gross_or_ctc' ? 12 : 6) : 0;
  const rem = remote.status === 'eligible' ? 15 : remote.status === 'verify' ? 5 : 0;
  const stab = (emp === 'permanent' ? 10 : emp === 'unknown' ? 5 : 2);
  const ageDays = job.postedAt ? (now - new Date(job.postedAt)) / 864e5 : 99;
  const fresh = ageDays <= 2 ? 5 : ageDays <= 7 ? 3 : ageDays <= 14 ? 1 : 0;
  const score = role + skills + comp + rem + stab + fresh;

  const hard = [];
  if (remote.status === 'excluded') hard.push(remote.evidence);
  if (fit === 'fail') hard.push(`Pay below ₹${min.toLocaleString('en-IN')}/month (${salary.evidence})`);
  if (edu.status === 'excluded') hard.push(edu.evidence);
  if (swEng) hard.push('Software-engineering role, outside target roles');
  const verify = [];
  if (remote.status === 'verify') verify.push(remote.evidence);
  if (fit === 'verify') verify.push(salary.kind === 'gross_or_ctc' ? (salary.lowMonthlyInr && salary.lowMonthlyInr < 50000 ? 'Pay range starts below your minimum; only the top of the range reaches it' : 'Gross/CTC meets minimum but in-hand unconfirmed') : 'Salary unknown or non-INR');
  if (edu.status === 'review') verify.push(edu.evidence);
  if (emp === 'contract' || emp === 'commission_only') verify.push(`Not a permanent role (${emp})`);

  const yrs = minYears(job.description || '');
  if (TITLE_BAD.test(job.title)) hard.push('Title is engineering/leadership/senior, outside your target roles');
  if (yrs > 4) hard.push(`Asks ${yrs}+ years of experience`);
  const bucket = salary.kind === 'foreign_currency' ? 'usd' : salary.kind === 'unknown' ? 'unspecified' : 'inr';
  const eligibility = hard.length ? 'excluded' : verify.length ? 'verify' : 'eligible';
  const missing = [];
  if (!roleHits.length) missing.push('No clear support/operations role keywords');
  const confidence = eligibility === 'eligible' && salary.kind === 'verified_inhand' ? 'high' : verify.length > 1 ? 'low' : 'medium';

  return {
    score, matchPct: matchPct(job.title, job.description), bucket, eligibility, confidence, category: categorise(job.title, job.description),
    breakdown: { role, skills, comp, remote: rem, stability: stab, freshness: fresh },
    why: [...roleHits.slice(0, 3).map(r => `Role keyword: ${r}`), ...skillHits.slice(0, 3).map(s => `Skill: ${s}`)],
    missing, hardFailures: hard, needsVerification: verify,
    salary, remoteEvidence: remote.evidence, employmentType: emp,
  };
}

// ---------- Application state machine ----------
export const STATUSES = ['New', 'Saved', 'Ready to Apply', 'Applied', 'Assessment', 'Interview', 'Offer', 'Rejected', 'Closed', 'Follow-up Required'];
const NEXT = {
  'New': ['Saved', 'Ready to Apply', 'Applied', 'Rejected', 'Closed'],
  'Saved': ['Ready to Apply', 'Applied', 'Rejected', 'Closed'],
  'Ready to Apply': ['Applied', 'Saved', 'Rejected', 'Closed'],
  'Applied': ['Assessment', 'Interview', 'Rejected', 'Closed', 'Follow-up Required', 'Offer'],
  'Assessment': ['Interview', 'Rejected', 'Closed', 'Follow-up Required', 'Offer'],
  'Interview': ['Assessment', 'Offer', 'Rejected', 'Closed', 'Follow-up Required'],
  'Follow-up Required': ['Applied', 'Assessment', 'Interview', 'Offer', 'Rejected', 'Closed'],
  'Offer': ['Rejected', 'Closed'],
  'Rejected': [], 'Closed': [],
};
export function transition(app, to, { by = 'user', at = new Date().toISOString() } = {}) {
  if (!STATUSES.includes(to)) throw new Error(`Unknown status: ${to}`);
  if (!NEXT[app.status].includes(to)) throw new Error(`Invalid transition ${app.status} -> ${to}`);
  // "Applied" is only ever set by an explicit user action, never by the system.
  if (to === 'Applied' && by !== 'user') throw new Error('Only the user can mark a job as Applied');
  return { ...app, status: to, appliedAt: to === 'Applied' ? at : app.appliedAt,
    history: [...(app.history || []), { from: app.status, to, by, at }] };
}
export function canCreateApplication(applications, job) {
  const c = canonicalUrl(job.applyUrl || job.url);
  return !applications.some(a => a.jobId === job.id || (c && canonicalUrl(a.applyUrl) === c));
}
