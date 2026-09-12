// Pure logic for "กลางวันกับกลางคืนต่างกันมากไหม?".
// No DB, no DOM — testable in test.mjs and reusable on server + client.
//
// day / night: one period's aggregates per side,
//   { n, avgHum, minHum, maxHum, avgTemp, pctOver60 }
// Returns the gaps (night − day), which side is worse, and how big the gap is.

// How wide a humidity gap has to be before it means anything for dye storage.
// Under 2% sits inside the sensor's own spread; 10%+ is the point where day and
// night effectively need different handling (fan/dehumidifier schedule).
const HUM_LEVELS = [
  { under: 2, level: "none", label: "แทบไม่ต่างกัน" },
  { under: 5, level: "small", label: "ต่างกันเล็กน้อย" },
  { under: 10, level: "medium", label: "ต่างกันชัดเจน" },
  { under: Infinity, level: "large", label: "ต่างกันมาก" },
];

const round1 = (v) => Math.round(v * 10) / 10;
const num = (v) => (v == null ? null : Number(v));

function delta(a, b) { // b − a, null unless both sides have a value
  const x = num(a), y = num(b);
  return x == null || y == null ? null : round1(y - x);
}

export function analyzeDayNight(day, night) {
  const dn = num(day && day.n) || 0;
  const nn = num(night && night.n) || 0;
  if (!dn || !nn) {
    return {
      ok: false, level: "nodata", label: "ข้อมูลไม่พอเทียบ",
      dHum: null, dTemp: null, dOver60: null, gap: null, wetter: null, hotter: null,
    };
  }

  const dHum = delta(day.avgHum, night.avgHum);
  const dTemp = delta(day.avgTemp, night.avgTemp);
  const dOver60 = delta(day.pctOver60, night.pctOver60);
  const gap = dHum == null ? null : Math.abs(dHum);

  const bucket = HUM_LEVELS.find((b) => gap < b.under);
  // a gap under the "none" threshold is noise — don't name a wetter side
  const wetter = bucket.level === "none" ? null : dHum > 0 ? "night" : "day";
  const hotter = dTemp == null || Math.abs(dTemp) < 0.5 ? null : dTemp > 0 ? "night" : "day";

  return { ok: true, level: bucket.level, label: bucket.label, dHum, dTemp, dOver60, gap, wetter, hotter };
}
