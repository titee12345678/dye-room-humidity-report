// Smoke tests for the pure logic (no DB / no server needed). Run: npm test
import { parseText, decodeBuffer } from "./public/parse.js";
import { resolvePeriod } from "./shared/period.js";
import { analyzeAgreement } from "./shared/agreement.js";

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

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
