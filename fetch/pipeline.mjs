import { scoreJob, isDuplicate, canonicalUrl } from '../core/engine.mjs';
export const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&amp;|&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
// batches: { sourceName: Job[] | null }  (null = source failed; its jobs are left untouched)
export function merge(existing, batches, now = new Date()) {
  const jobs = existing.map(j => ({ ...j })), stats = {}, added = [];
  for (const [src, list] of Object.entries(batches)) {
    if (!list) { stats[src] = { ok: false, checkedAt: now.toISOString() }; continue; }
    const seen = new Set(); let kept = 0;
    for (const j of list) {
      const url = canonicalUrl(j.applyUrl || j.sourceUrl); if (!url) continue;
      const sc = scoreJob(j, now);
      if (sc.matchPct < 80 || sc.eligibility === 'excluded') continue;
      kept++;
      const ex = jobs.find(x => isDuplicate(x, j));
      if (ex) { Object.assign(ex, sc, { lastSeen: now.toISOString(), closed: false }); seen.add(ex.id); continue; }
      const nj = { ...j, id: url, ...sc, firstSeen: now.toISOString(), lastSeen: now.toISOString(), closed: false };
      jobs.push(nj); seen.add(nj.id); added.push(nj);
    }
    for (const x of jobs) if (x.source === src && !seen.has(x.id)) x.closed = true;
    stats[src] = { ok: true, found: list.length, relevant: kept, checkedAt: now.toISOString() };
  }
  return { jobs, stats, added };
}
