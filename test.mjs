// Smoke tests for the pure logic (no DB / no server needed). Run: npm test
import { parseText, decodeBuffer } from "./public/parse.js";
import { resolvePeriod } from "./shared/period.js";
import { analyzeAgreement } from "./shared/agreement.js";
import { analyzeDayNight } from "./shared/daynight.js";

let pass = 0, fail = 0;
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
}
function eq(name, got, want) { ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }

console.log("parse — sensor format (Tab, MAC header)");
{
  const txt = [
    "MAC ADDRESS: E4:AE:E4:C4:4F:16",
    "Time\tTemperature\tHumidity\tDew point\tVPD",
    "05/28/2026 14:10\t30.0C\t45.4%\t16.9C\t2.3kPa",
    "05/28/2026 14:20\t29.2C\t42.9%\t15.3C\t2.3kPa",
  ].join("\n");
  const r = parseText(txt);
  eq("mac parsed", r.mac, "E4:AE:E4:C4:4F:16");
  eq("row count", r.rows.length, 2);
  eq("first row", r.rows[0], { ts: "2026-05-28T14:10:00", temp: 30, hum: 45.4, dew: 16.9, vpd: 2.3 });
}

console.log("parse — plain CSV (comma, UTF-8)");
{
  const txt = "Time,Temperature,Humidity,Dew point,VPD\n2026-06-13 14:20,30.0,50.8,18.7,2.1";
  const r = parseText(txt);
  eq("row count", r.rows.length, 1);
  eq("ts normalized", r.rows[0].ts, "2026-06-13T14:20:00");
  eq("hum", r.rows[0].hum, 50.8);
}

console.log("parse — skips malformed / header rows");
{
  // a 5-column row with an unparseable timestamp -> counted as skipped; a short junk line -> ignored
  const txt = "Time\tTemperature\tHumidity\tDew point\tVPD\njunk\nnotadate\t31C\t70%\t25C\t1.4kPa\n06/01/2026 00:00\t31C\t70%\t25C\t1.4kPa";
  const r = parseText(txt);
  eq("only valid rows kept", r.rows.length, 1);
  ok("bad-timestamp row counted as skipped", r.skipped >= 1, `skipped=${r.skipped}`);
}

console.log("decodeBuffer — UTF-16LE BOM");
{
  const bytes = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]); // BOM + "AB"
  eq("decodes AB", decodeBuffer(bytes.buffer), "AB");
}

console.log("resolvePeriod — day/week/month/year");
{
  eq("day", resolvePeriod("day", "2026-06-13"),
    { start: "2026-06-13 00:00:00", end: "2026-06-14 00:00:00", grain: "raw", label: "2026-06-13" });
  const w = resolvePeriod("week", "2026-06-13"); // Sat -> week Mon 6/8..6/15
  eq("week start (Mon)", w.start, "2026-06-08 00:00:00");
  eq("week end", w.end, "2026-06-15 00:00:00");
  eq("week grain", w.grain, "day");
  const m = resolvePeriod("month", "2026-06-15");
  eq("month start", m.start, "2026-06-01 00:00:00");
  eq("month end", m.end, "2026-07-01 00:00:00");
  const y = resolvePeriod("year", "2026-03-01");
  eq("year start", y.start, "2026-01-01 00:00:00");
  eq("year end", y.end, "2027-01-01 00:00:00");
  eq("year grain", y.grain, "month");
}

console.log("analyzeAgreement — humidity, good agreement (2 devices)");
{
  const series = [
    { mac: "A", t: "d1", hum: 58 }, { mac: "B", t: "d1", hum: 57 },
    { mac: "A", t: "d2", hum: 60 }, { mac: "B", t: "d2", hum: 58 },
    { mac: "A", t: "d3", hum: 59 }, { mac: "B", t: "d3", hum: 60 },
  ];
  const devices = [{ mac: "A", hum: { avg: 59 } }, { mac: "B", hum: { avg: 58.3 } }];
  const r = analyzeAgreement(series, devices, "hum", { good: 3, bad: 6 });
  eq("gapMax", r.gapMax, 2);
  eq("gapAvg", r.gapAvg, 1.3);
  eq("level good", r.level, "good");
  eq("no outlier (2 devices)", r.outlier, null);
}

console.log("analyzeAgreement — one device reads far off (3 devices)");
{
  const series = [
    { mac: "A", t: "t1", hum: 58 }, { mac: "B", t: "t1", hum: 57 }, { mac: "C", t: "t1", hum: 70 },
  ];
  const devices = [
    { mac: "A", hum: { avg: 58 } }, { mac: "B", hum: { avg: 57 } }, { mac: "C", hum: { avg: 70 } },
  ];
  const r = analyzeAgreement(series, devices, "hum", { good: 3, bad: 6 });
  eq("gapMax", r.gapMax, 13);
  eq("level bad", r.level, "bad");
  eq("outlier = C", r.outlier, "C");
}

console.log("analyzeAgreement — exact gaps + 2-device never flags outlier");
{
  const series = [
    { mac: "A", t: "t1", temp: 30 }, { mac: "B", t: "t1", temp: 29 },
    { mac: "A", t: "t2", temp: 31 }, { mac: "B", t: "t2", temp: 29 },
  ];
  const devices = [{ mac: "A", temp: { avg: 30.5 } }, { mac: "B", temp: { avg: 29 } }];
  const r = analyzeAgreement(series, devices, "temp", { good: 0.5, bad: 1.5 });
  eq("gapAvg", r.gapAvg, 1.5);
  eq("gapMax", r.gapMax, 2);
  eq("level bad", r.level, "bad");
  eq("no outlier (2 devices)", r.outlier, null);
}

console.log("analyzeAgreement — single device → 'single'");
{
  const series = [{ mac: "A", t: "t1", hum: 50 }, { mac: "A", t: "t2", hum: 51 }];
  const devices = [{ mac: "A", hum: { avg: 50.5 } }];
  const r = analyzeAgreement(series, devices, "hum", { good: 3, bad: 6 });
  eq("level single", r.level, "single");
  eq("gapAvg null", r.gapAvg, null);
  eq("gapMax null", r.gapMax, null);
  eq("outlier null", r.outlier, null);
}

console.log("analyzeAgreement — buckets with only one device are skipped");
{
  const series = [
    { mac: "A", t: "t1", hum: 50 }, { mac: "B", t: "t1", hum: 52 }, // gap 2
    { mac: "A", t: "t2", hum: 50 },                                 // skipped (1 device)
    { mac: "A", t: "t3", hum: 51 }, { mac: "B", t: "t3", hum: 50 }, // gap 1
  ];
  const devices = [{ mac: "A", hum: { avg: 50.3 } }, { mac: "B", hum: { avg: 51 } }];
  const r = analyzeAgreement(series, devices, "hum", { good: 3, bad: 6 });
  eq("gapAvg over 2 buckets", r.gapAvg, 1.5);
  eq("gapMax", r.gapMax, 2);
}

console.log("analyzeDayNight — night much wetter than day");
{
  const day = { n: 1152, avgHum: 62.0, minHum: 42.9, maxHum: 80.7, avgTemp: 33.1, pctOver60: 55 };
  const night = { n: 1152, avgHum: 76.4, minHum: 55.0, maxHum: 86.3, avgTemp: 29.1, pctOver60: 92 };
  const r = analyzeDayNight(day, night);
  eq("gap", r.gap, 14.4);
  eq("dHum is night minus day", r.dHum, 14.4);
  eq("level large", r.level, "large");
  eq("night is the wetter side", r.wetter, "night");
  eq("day is the hotter side", r.hotter, "day");
  eq("dOver60", r.dOver60, 37);
}

console.log("analyzeDayNight — day wetter (sign flips, not the level)");
{
  const r = analyzeDayNight({ n: 10, avgHum: 70, avgTemp: 30, pctOver60: 80 },
                            { n: 10, avgHum: 63, avgTemp: 30, pctOver60: 62 });
  eq("dHum negative", r.dHum, -7);
  eq("gap is absolute", r.gap, 7);
  eq("level medium", r.level, "medium");
  eq("day is the wetter side", r.wetter, "day");
  eq("no hotter side (temp equal)", r.hotter, null);
}

console.log("analyzeDayNight — a gap inside sensor noise names no side");
{
  const r = analyzeDayNight({ n: 10, avgHum: 70, avgTemp: 30.2, pctOver60: 80 },
                            { n: 10, avgHum: 71.9, avgTemp: 30, pctOver60: 82 });
  eq("level none", r.level, "none");
  eq("wetter null", r.wetter, null);
  eq("hotter null (under 0.5 deg)", r.hotter, null);
  eq("gap still reported", r.gap, 1.9);
}

console.log("analyzeDayNight — level boundaries are exclusive at the top");
{
  const at = (g) => analyzeDayNight({ n: 1, avgHum: 60 }, { n: 1, avgHum: 60 + g }).level;
  eq("1.9 -> none", at(1.9), "none");
  eq("2 -> small", at(2), "small");
  eq("4.9 -> small", at(4.9), "small");
  eq("5 -> medium", at(5), "medium");
  eq("9.9 -> medium", at(9.9), "medium");
  eq("10 -> large", at(10), "large");
}

console.log("analyzeDayNight — one side empty gives nodata");
{
  const r = analyzeDayNight({ n: 0 }, { n: 144, avgHum: 71 });
  eq("not ok", r.ok, false);
  eq("level nodata", r.level, "nodata");
  eq("dHum null", r.dHum, null);
  eq("gap null", r.gap, null);
}

console.log("analyzeDayNight — risk follows the readings, not the day/night gap");
{
  // the bug this guards: two sides that match at 75% must never look like good news
  const both75 = analyzeDayNight({ n: 10, avgHum: 75 }, { n: 10, avgHum: 76 });
  eq("matching sides -> no gap", both75.level, "none");
  eq("but the room is still bad", both75.risk, "bad");
  eq("worst side reported", both75.worstHum, 76);
  eq("both sides over 60", both75.sidesOver60, 2);

  const both52 = analyzeDayNight({ n: 10, avgHum: 52 }, { n: 10, avgHum: 53 });
  eq("matching and actually dry -> ok", both52.risk, "ok");
  eq("neither side over 60", both52.sidesOver60, 0);

  const bigGapLow = analyzeDayNight({ n: 10, avgHum: 44 }, { n: 10, avgHum: 53 });
  eq("a wide gap under the threshold is still ok", bigGapLow.risk, "ok");
  eq("level still reports the gap", bigGapLow.level, "medium");
}

console.log("analyzeDayNight — risk thresholds sit at 60 and 70");
{
  const at = (d, n) => analyzeDayNight({ n: 1, avgHum: d }, { n: 1, avgHum: n });
  eq("59.9 / 59.9 -> ok", at(59.9, 59.9).risk, "ok");
  eq("59.9 / 60 -> warn (worst side decides)", at(59.9, 60).risk, "warn");
  eq("69.9 -> warn", at(50, 69.9).risk, "warn");
  eq("70 -> bad", at(50, 70).risk, "bad");
  eq("one side over counts as one", at(55, 64).sidesOver60, 1);
}

console.log("analyzeDayNight — no data carries no risk claim");
{
  const r = analyzeDayNight({ n: 0 }, { n: 144, avgHum: 71 });
  eq("risk nodata", r.risk, "nodata");
  eq("worstHum null", r.worstHum, null);
  eq("sidesOver60 zero", r.sidesOver60, 0);
}

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
