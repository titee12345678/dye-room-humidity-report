// Pure logic for "do the sensors in the same room agree?".
// No DB, no DOM — testable in test.mjs and reusable on server + client.
//
// series:  flat rows aligned to time buckets, e.g. { mac, t, hum, temp, dew }
// devices: per-device period summary, e.g. { mac, name, hum:{avg,min,max}, ... }
// metric:  "hum" | "temp" | "dew"
// thr:     { good, bad } — max bucket gap that still counts as good / start of "bad"

const round1 = (v) => Math.round(v * 10) / 10;

function median(nums) {
  const a = [...nums].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function analyzeAgreement(series, devices, metric, thr) {
  // group readings into buckets by time key, collecting this metric across devices
  const byT = new Map();
  for (const r of series || []) {
    const v = r[metric];
    if (v == null) continue;
    if (!byT.has(r.t)) byT.set(r.t, []);
    byT.get(r.t).push(Number(v));
  }

  // gap per bucket where at least two devices reported — that's the disagreement
  const gaps = [];
  for (const arr of byT.values()) {
    if (arr.length >= 2) gaps.push(Math.max(...arr) - Math.min(...arr));
  }
  if (gaps.length === 0) {
    return { gapAvg: null, gapMax: null, outlier: null, level: "single" };
  }

  const gapAvg = round1(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  const gapMax = round1(Math.max(...gaps));
  const level = gapMax <= thr.good ? "good" : gapMax <= thr.bad ? "warn" : "bad";

  // outlier only makes sense with 3+ devices — with two you can't tell which is wrong
  let outlier = null;
  const avgs = (devices || [])
    .map((d) => ({ mac: d.mac, avg: d[metric] && d[metric].avg != null ? Number(d[metric].avg) : null }))
    .filter((x) => x.avg != null);
  if (avgs.length >= 3) {
    const med = median(avgs.map((x) => x.avg));
    let best = null;
    for (const x of avgs) {
      const dev = Math.abs(x.avg - med);
      if (!best || dev > best.dev) best = { mac: x.mac, dev };
    }
    if (best && best.dev > thr.bad / 2) outlier = best.mac;
  }

  return { gapAvg, gapMax, outlier, level };
}

// default thresholds, tuned to Inkbird IBS-TH3 accuracy (±3%RH, ±0.5°C)
export const THRESHOLDS = {
  hum: { good: 3, bad: 6 },
  temp: { good: 0.5, bad: 1.5 },
  dew: { good: 0.5, bad: 1.5 },
};
