import { sql, json } from "../../shared/db.js";
import { resolvePeriod } from "../../shared/period.js";
import { analyzeAgreement, THRESHOLDS } from "../../shared/agreement.js";

// GET /api/compare?range=day|week|month|year&date=YYYY-MM-DD
// Returns every device's reading aligned to shared time buckets, day×hour cells
// for heatmaps, and a per-metric agreement summary (do the sensors agree?).
const n1 = (v) => (v == null ? null : Number(v));

export default async (req) => {
  const u = new URL(req.url);
  const range = u.searchParams.get("range") || "month";
  const date = u.searchParams.get("date");
  if (!["day", "week", "month", "year"].includes(range)) return json({ error: "bad range" }, 400);
  if (!date) return json({ error: "date required" }, 400);

  const { start, end, grain, label } = resolvePeriod(range, date);

  try {
    // per-device period summary — only devices with data in this period
    const sumRows = await sql`
      SELECT r.device_mac AS mac,
        COALESCE(NULLIF(d.name, ''), r.device_mac) AS name,
        count(*)::int AS n,
        round(avg(r.hum)::numeric, 1)  AS hum_avg,  min(r.hum)  AS hum_min,  max(r.hum)  AS hum_max,
        round(avg(r.temp)::numeric, 1) AS temp_avg, min(r.temp) AS temp_min, max(r.temp) AS temp_max,
        round(avg(r.dew)::numeric, 1)  AS dew_avg,  min(r.dew)  AS dew_min,  max(r.dew)  AS dew_max
      FROM readings r
      LEFT JOIN devices d ON d.device_mac = r.device_mac
      WHERE r.ts >= ${start}::timestamp AND r.ts < ${end}::timestamp
      GROUP BY r.device_mac, d.name
      ORDER BY name`;

    // per-device, per-bucket averages — bucket follows the period grain
    let raw;
    if (grain === "raw") {        // day → 10-minute buckets (matches the main dashboard's detail)
      raw = await sql`
        SELECT device_mac AS mac,
          to_char(date_bin('10 minutes', ts, timestamp '2000-01-01'), 'YYYY-MM-DD"T"HH24:MI:00') AS t,
          round(avg(hum)::numeric, 1) AS hum, round(avg(temp)::numeric, 1) AS temp, round(avg(dew)::numeric, 1) AS dew
        FROM readings
        WHERE ts >= ${start}::timestamp AND ts < ${end}::timestamp
        GROUP BY 1, 2 ORDER BY 2, 1`;
    } else if (grain === "day") { // week/month → daily buckets
      raw = await sql`
        SELECT device_mac AS mac, to_char(date_trunc('day', ts), 'YYYY-MM-DD') AS t,
          round(avg(hum)::numeric, 1) AS hum, round(avg(temp)::numeric, 1) AS temp, round(avg(dew)::numeric, 1) AS dew
        FROM readings
        WHERE ts >= ${start}::timestamp AND ts < ${end}::timestamp
        GROUP BY 1, 2 ORDER BY 2, 1`;
    } else {                      // year → monthly buckets
      raw = await sql`
        SELECT device_mac AS mac, to_char(date_trunc('month', ts), 'YYYY-MM') AS t,
          round(avg(hum)::numeric, 1) AS hum, round(avg(temp)::numeric, 1) AS temp, round(avg(dew)::numeric, 1) AS dew
        FROM readings
        WHERE ts >= ${start}::timestamp AND ts < ${end}::timestamp
        GROUP BY 1, 2 ORDER BY 2, 1`;
    }

    // day×hour (week/month) or month×hour (year) cells per device — for the heatmaps.
    // Day range gets no heatmap (a single day has no day×hour grid), same as the main dashboard.
    let heatRows = [];
    if (grain === "day") {
      heatRows = await sql`
        SELECT device_mac AS mac, to_char(date_trunc('day', ts), 'YYYY-MM-DD') AS d, extract(hour from ts)::int AS h,
          round(avg(hum)::numeric, 1) AS hum, round(avg(temp)::numeric, 1) AS temp, round(avg(dew)::numeric, 1) AS dew
        FROM readings
        WHERE ts >= ${start}::timestamp AND ts < ${end}::timestamp
        GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`;
    } else if (grain === "month") {
      heatRows = await sql`
        SELECT device_mac AS mac, to_char(date_trunc('month', ts), 'YYYY-MM') AS d, extract(hour from ts)::int AS h,
          round(avg(hum)::numeric, 1) AS hum, round(avg(temp)::numeric, 1) AS temp, round(avg(dew)::numeric, 1) AS dew
        FROM readings
        WHERE ts >= ${start}::timestamp AND ts < ${end}::timestamp
        GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`;
    }

    const devices = sumRows.map((r) => ({
      mac: r.mac, name: r.name, n: n1(r.n),
      hum:  { avg: n1(r.hum_avg),  min: n1(r.hum_min),  max: n1(r.hum_max) },
      temp: { avg: n1(r.temp_avg), min: n1(r.temp_min), max: n1(r.temp_max) },
      dew:  { avg: n1(r.dew_avg),  min: n1(r.dew_min),  max: n1(r.dew_max) },
    }));

    const series = raw.map((r) => ({
      mac: r.mac, t: r.t, hum: n1(r.hum), temp: n1(r.temp), dew: n1(r.dew),
    }));

    const heat = heatRows.map((r) => ({
      mac: r.mac, d: r.d, h: n1(r.h), hum: n1(r.hum), temp: n1(r.temp), dew: n1(r.dew),
    }));

    const buckets = [...new Set(series.map((s) => s.t))].sort();

    const agreement = {};
    for (const m of ["hum", "temp", "dew"]) {
      agreement[m] = analyzeAgreement(series, devices, m, THRESHOLDS[m]);
    }

    return json({ range, date, start, end, grain, label, buckets, devices, series, heat, agreement });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};
