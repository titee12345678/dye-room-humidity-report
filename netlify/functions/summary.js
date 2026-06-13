import { sql, json } from "../../shared/db.js";
import { resolvePeriod } from "../../shared/period.js";

// GET /api/summary?range=day|week|month|year&date=YYYY-MM-DD
export default async (req) => {
  const u = new URL(req.url);
  const range = u.searchParams.get("range") || "month";
  const date = u.searchParams.get("date");
  if (!["day", "week", "month", "year"].includes(range)) return json({ error: "bad range" }, 400);
  if (!date) return json({ error: "date required" }, 400);

  const { start, end, grain, label } = resolvePeriod(range, date);

  try {
    const summary = (await sql`
      SELECT count(*)::int AS n,
        round(avg(hum)::numeric, 1) AS avg_hum, min(hum) AS min_hum, max(hum) AS max_hum,
        round(avg(temp)::numeric, 1) AS avg_temp, min(temp) AS min_temp, max(temp) AS max_temp,
        round(avg(dew)::numeric, 1) AS avg_dew,
        round((100.0 * avg(CASE WHEN hum >= 60 THEN 1 ELSE 0 END))::numeric, 0) AS pct_over60,
        round((100.0 * avg(CASE WHEN hum >= 70 THEN 1 ELSE 0 END))::numeric, 0) AS pct_over70
      FROM readings
      WHERE ts >= ${start}::timestamp AND ts < ${end}::timestamp`)[0];

    let points;
    if (grain === "raw") {
      points = await sql`
        SELECT to_char(ts, 'YYYY-MM-DD"T"HH24:MI:SS') AS t, hum, temp, dew, vpd
        FROM readings
        WHERE ts >= ${start}::timestamp AND ts < ${end}::timestamp
        ORDER BY ts`;
    } else if (grain === "day") {
      points = await sql`
        SELECT to_char(date_trunc('day', ts), 'YYYY-MM-DD') AS t,
          round(avg(hum)::numeric, 1) AS hum, min(hum) AS hum_min, max(hum) AS hum_max,
          round(avg(temp)::numeric, 1) AS temp, max(temp) AS temp_max, count(*)::int AS n
        FROM readings
        WHERE ts >= ${start}::timestamp AND ts < ${end}::timestamp
        GROUP BY 1 ORDER BY 1`;
    } else { // month
      points = await sql`
        SELECT to_char(date_trunc('month', ts), 'YYYY-MM') AS t,
          round(avg(hum)::numeric, 1) AS hum, min(hum) AS hum_min, max(hum) AS hum_max,
          round(avg(temp)::numeric, 1) AS temp, max(temp) AS temp_max, count(*)::int AS n
        FROM readings
        WHERE ts >= ${start}::timestamp AND ts < ${end}::timestamp
        GROUP BY 1 ORDER BY 1`;
    }

    // hour-of-day pattern (avg across the period) — "ช่วงไหนชื้น"
    const hourly = await sql`
      SELECT extract(hour from ts)::int AS h,
        round(avg(hum)::numeric, 1) AS hum, round(avg(temp)::numeric, 1) AS temp
      FROM readings
      WHERE ts >= ${start}::timestamp AND ts < ${end}::timestamp
      GROUP BY 1 ORDER BY 1`;

    // humidity level distribution — "สัดส่วนระดับความชื้น"
    const dist = (await sql`
      SELECT
        sum(CASE WHEN hum < 40 THEN 1 ELSE 0 END)::int AS dry,
        sum(CASE WHEN hum >= 40 AND hum < 60 THEN 1 ELSE 0 END)::int AS ideal,
        sum(CASE WHEN hum >= 60 AND hum < 70 THEN 1 ELSE 0 END)::int AS humid,
        sum(CASE WHEN hum >= 70 THEN 1 ELSE 0 END)::int AS veryhigh
      FROM readings
      WHERE ts >= ${start}::timestamp AND ts < ${end}::timestamp`)[0];

    return json({ range, date, start, end, grain, label, summary, points, hourly, dist });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};
