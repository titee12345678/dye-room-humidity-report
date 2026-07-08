import { sql, json } from "../../shared/db.js";

// GET /api/window?start=YYYY-MM-DD&days=N&device=MAC
// Summary + daily series for an arbitrary N-day window (used by the compare page).
function addDays(s, n) {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export default async (req) => {
  const u = new URL(req.url);
  const start = u.searchParams.get("start");
  const days = Math.min(180, Math.max(1, parseInt(u.searchParams.get("days") || "14", 10)));
  const device = u.searchParams.get("device") || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || "")) return json({ error: "start ต้องเป็น YYYY-MM-DD" }, 400);

  const s = start + " 00:00:00";
  const endDate = addDays(start, days);
  const e = endDate + " 00:00:00";
  try {
    const summary = (await sql`
      SELECT count(*)::int AS n,
        round(avg(hum)::numeric, 1) AS avg_hum, min(hum) AS min_hum, max(hum) AS max_hum,
        round(avg(temp)::numeric, 1) AS avg_temp,
        round((100.0 * avg(CASE WHEN hum >= 60 THEN 1 ELSE 0 END))::numeric, 0) AS pct_over60
      FROM readings
      WHERE ts >= ${s}::timestamp AND ts < ${e}::timestamp
        AND (${device}::text IS NULL OR device_mac = ${device})`)[0];

    const series = await sql`
      SELECT to_char(date_trunc('day', ts), 'YYYY-MM-DD') AS t,
        round(avg(hum)::numeric, 1) AS hum, min(hum) AS hum_min, max(hum) AS hum_max,
        round(avg(temp)::numeric, 1) AS temp
      FROM readings
      WHERE ts >= ${s}::timestamp AND ts < ${e}::timestamp
        AND (${device}::text IS NULL OR device_mac = ${device})
      GROUP BY 1 ORDER BY 1`;

    return json({ start, end: endDate, days, summary, series });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
};
