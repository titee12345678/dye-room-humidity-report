// Smoke tests for the pure logic (no DB / no server needed). Run: npm test
import { parseText, decodeBuffer } from "./public/parse.js";
import { resolvePeriod } from "./shared/period.js";

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

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
