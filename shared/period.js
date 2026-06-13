// Resolve a {range, date} into SQL bounds + aggregation grain.
// All timestamps are treated as naive local (Asia/Bangkok) — no tz conversion.
// We use UTC Date math purely as a calendar calculator, then format Y-M-D strings.

function parseYMD(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return { y, m: m || 1, d: d || 1 };
}
const toDate = (p) => new Date(Date.UTC(p.y, p.m - 1, p.d));
const fmt = (dt) => dt.toISOString().slice(0, 10);
function addDays(dt, n) { const x = new Date(dt); x.setUTCDate(x.getUTCDate() + n); return x; }
function startOfWeek(dt) { // Monday
  const x = new Date(dt);
  const dow = (x.getUTCDay() + 6) % 7; // 0 = Monday
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

export function resolvePeriod(range, dateStr) {
  const p = parseYMD(dateStr);
  const d = toDate(p);
  let start, end, grain, label;
  if (range === "day") {
    start = fmt(d); end = fmt(addDays(d, 1)); grain = "raw"; label = start;
  } else if (range === "week") {
    const mon = startOfWeek(d);
    start = fmt(mon); end = fmt(addDays(mon, 7)); grain = "day";
    label = `${start} – ${fmt(addDays(mon, 6))}`;
  } else if (range === "month") {
    start = fmt(new Date(Date.UTC(p.y, p.m - 1, 1)));
    end = fmt(new Date(Date.UTC(p.y, p.m, 1)));
    grain = "day"; label = `${p.y}-${String(p.m).padStart(2, "0")}`;
  } else { // year
    start = `${p.y}-01-01`; end = `${p.y + 1}-01-01`; grain = "month"; label = String(p.y);
  }
  return { start: start + " 00:00:00", end: end + " 00:00:00", grain, label };
}
