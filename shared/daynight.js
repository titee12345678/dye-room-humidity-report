// Pure logic for "กลางวันกับกลางคืนต่างกันมากไหม?".
// No DB, no DOM — testable in test.mjs and reusable on server + client.
//
// day / night: one period's aggregates per side,
//   { n, avgHum, minHum, maxHum, avgTemp, pctOver60 }
// Returns the gaps (night − day), how big the gap is, and — separately — how bad
// the humidity actually is. Those two are NOT the same question: a room sitting at
// 75% both day and night has no gap worth acting on and is still a bad room, so the
// card must not read as good news just because the two sides match.

// How wide a humidity gap has to be before it means anything for dye storage.
// Under 2% sits inside the sensor's own spread; 10%+ is the point where day and
// night effectively need different handling (fan/dehumidifier schedule).
const HUM_LEVELS = [
  { under: 2, level: "none", label: "แทบไม่ต่างกัน" },
  { under: 5, level: "small", label: "ต่างกันเล็กน้อย" },
  { under: 10, level: "medium", label: "ต่างกันชัดเจน" },
  { under: Infinity, level: "large", label: "ต่างกันมาก" },
];

// Storage thresholds — the same ones the dashboard colours by: dye powder wants
// under 60% RH, and 70%+ is where caking and mould get likely.
const HUM_OVER = 60, HUM_BAD = 70;

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
      risk: "nodata", worstHum: null, sidesOver60: 0,
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

  // risk is about the readings themselves, not the gap — this is what the card's
  // colour and icon must follow, so "ชื้นพอ ๆ กัน" at 75% never shows up as a green tick
  const hums = [num(day.avgHum), num(night.avgHum)].filter((v) => v != null);
  const worstHum = hums.length ? round1(Math.max(...hums)) : null;
  const sidesOver60 = hums.filter((v) => v >= HUM_OVER).length;
  const risk = worstHum == null ? "nodata"
    : worstHum >= HUM_BAD ? "bad"
    : worstHum >= HUM_OVER ? "warn" : "ok";

  return { ok: true, level: bucket.level, label: bucket.label, dHum, dTemp, dOver60, gap,
    wetter, hotter, risk, worstHum, sidesOver60 };
}
