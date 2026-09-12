import { sql, json } from "../../shared/db.js";
import { resolvePeriod } from "../../shared/period.js";
import { analyzeDayNight } from "../../shared/daynight.js";

// GET /api/summary?range=day|week|month|year&date=YYYY-MM-DD
export default async (req) => {
  const u = new URL(req.url);
  const range = u.searchParams.get("range") || "month";
  const date = u.searchParams.get("date");
  const device = u.searchParams.get("device") || null; // null = all devices
  // time-of-day filter: all | day (06:00–17:59) | night (18:00–05:59)
  const todRaw = u.searchParams.get("tod");
  const tod = ["day", "night"].includes(todRaw) ? todRaw : "all";
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
      WHERE ts >= ${start}::timestamp AND ts < ${end}::timestamp
        AND (${device}::text IS NULL OR device_mac = ${device})
        AND (${tod}::text = 'all'
          OR (${tod}::text = 'day' AND extract(hour from ts) BETWEEN 6 AND 17)
          OR (${tod}::text = 'night' AND (extract(hour from ts) < 6 OR extract(hour from ts) >= 18)))`)[0];

    let points;
    if (grain === "raw") {
      points = await sql`
        SELECT to_char(ts, 'YYYY-MM-DD"T"HH24:MI:SS') AS t, hum, temp, dew, vpd
        FROM readings
        WHERE ts >= ${start}::timestamp AND ts < ${end}::timestamp
        AND (${device}::text IS NULL OR device_mac = ${device})
        AND (${tod}::text = 'all'
          OR (${tod}::text = 'day' AND extract(hour from ts) BETWEEN 6 AND 17)
          OR (${tod}::text = 'night' AND (extract(hour from ts) < 6 OR extract(hour from ts) >= 18)))
        ORDER BY ts`;
    } else if (grain === "day") {
      points = await sql`
        SELECT to_char(date_trunc('day', ts), 'YYYY-MM-DD') AS t,
          round(avg(hum)::numeric, 1) AS hum, min(hum) AS hum_min, max(hum) AS hum_max,
          round(avg(temp)::numeric, 1) AS temp, max(temp) AS temp_max, count(*)::int AS n
        FROM readings
        WHERE ts >= ${start}::timestamp AND ts < ${end}::timestamp
        AND (${device}::text IS NULL OR device_mac = ${device})
        AND (${tod}::text = 'all'
          OR (${tod}::text = 'day' AND extract(hour from ts) BETWEEN 6 AND 17)
          OR (${tod}::text = 'night' AND (extract(hour from ts) < 6 OR extract(hour from ts) >= 18)))
        GROUP BY 1 ORDER BY 1`;
    } else { // month
      points = await sql`
        SELECT to_char(date_trunc('month', ts), 'YYYY-MM') AS t,
          round(avg(hum)::numeric, 1) AS hum, min(hum) AS hum_min, max(hum) AS hum_max,
          round(avg(temp)::numeric, 1) AS temp, max(temp) AS temp_max, count(*)::int AS n
        FROM readings
        WHERE ts >= ${start}::timestamp AND ts < ${end}::timestamp
        AND (${device}::text IS NULL OR device_mac = ${device})
        AND (${tod}::text = 'all'
          OR (${tod}::text = 'day' AND extract(hour from ts) BETWEEN 6 AND 17)
          OR (${tod}::text = 'night' AND (extract(hour from ts) < 6 OR extract(hour from ts) >= 18)))
        GROUP BY 1 ORDER BY 1`;
    }

    // hour-of-day pattern (avg across the period) — "ช่วงไหนชื้น"
    const hourly = await sql`
      SELECT extract(hour from ts)::int AS h,
        round(avg(hum)::numeric, 1) AS hum, round(avg(temp)::numeric, 1) AS temp
      FROM readings
      WHERE ts >= ${start}::timestamp AND ts < ${end}::timestamp
        AND (${device}::text IS NULL OR device_mac = ${device})
        AND (${tod}::text = 'all'
          OR (${tod}::text = 'day' AND extract(hour from ts) BETWEEN 6 AND 17)
          OR (${tod}::text = 'night' AND (extract(hour from ts) < 6 OR extract(hour from ts) >= 18)))
      GROUP BY 1 ORDER BY 1`;

    // humidity level distribution — "สัดส่วนระดับความชื้น"
    const dist = (await sql`
      SELECT
        sum(CASE WHEN hum < 40 THEN 1 ELSE 0 END)::int AS dry,
        sum(CASE WHEN hum >= 40 AND hum < 60 THEN 1 ELSE 0 END)::int AS ideal,
        sum(CASE WHEN hum >= 60 AND hum < 70 THEN 1 ELSE 0 END)::int AS humid,
        sum(CASE WHEN hum >= 70 THEN 1 ELSE 0 END)::int AS veryhigh
      FROM readings
      WHERE ts >= ${start}::timestamp AND ts < ${end}::timestamp
        AND (${device}::text IS NULL OR device_mac = ${device})
        AND (${tod}::text = 'all'
          OR (${tod}::text = 'day' AND extract(hour from ts) BETWEEN 6 AND 17)
          OR (${tod}::text = 'night' AND (extract(hour from ts) < 6 OR extract(hour from ts) >= 18)))`)[0];

    // day vs night side by side — "กลางวันกับกลางคืนต่างกันมากไหม"
    // Only for the unfiltered view; once tod picks a side there is nothing to compare.
    let split = null;
    if (tod === "all") {
      const r = (await sql`
        SELECT
          (count(*) FILTER (WHERE extract(hour from ts) BETWEEN 6 AND 17))::int AS d_n,
          round((avg(hum) FILTER (WHERE extract(hour from ts) BETWEEN 6 AND 17))::numeric, 1) AS d_avg_hum,
          min(hum) FILTER (WHERE extract(hour from ts) BETWEEN 6 AND 17) AS d_min_hum,
          max(hum) FILTER (WHERE extract(hour from ts) BETWEEN 6 AND 17) AS d_max_hum,
          round((avg(temp) FILTER (WHERE extract(hour from ts) BETWEEN 6 AND 17))::numeric, 1) AS d_avg_temp,
          round((100.0 * avg(CASE WHEN hum >= 60 THEN 1 ELSE 0 END)
            FILTER (WHERE extract(hour from ts) BETWEEN 6 AND 17))::numeric, 0) AS d_over60,
          (count(*) FILTER (WHERE extract(hour from ts) < 6 OR extract(hour from ts) >= 18))::int AS n_n,
          round((avg(hum) FILTER (WHERE extract(hour from ts) < 6 OR extract(hour from ts) >= 18))::numeric, 1) AS n_avg_hum,
          min(hum) FILTER (WHERE extract(hour from ts) < 6 OR extract(hour from ts) >= 18) AS n_min_hum,
          max(hum) FILTER (WHERE extract(hour from ts) < 6 OR extract(hour from ts) >= 18) AS n_max_hum,
          round((avg(temp) FILTER (WHERE extract(hour from ts) < 6 OR extract(hour from ts) >= 18))::numeric, 1) AS n_avg_temp,
          round((100.0 * avg(CASE WHEN hum >= 60 THEN 1 ELSE 0 END)
            FILTER (WHERE extract(hour from ts) < 6 OR extract(hour from ts) >= 18))::numeric, 0) AS n_over60
        FROM readings
        WHERE ts >= ${start}::timestamp AND ts < ${end}::timestamp
          AND (${device}::text IS NULL OR device_mac = ${device})`)[0];
      split = {
        day: { n: r.d_n, avgHum: r.d_avg_hum, minHum: r.d_min_hum, maxHum: r.d_max_hum,
               avgTemp: r.d_avg_temp, pctOver60: r.d_over60 },
        night: { n: r.n_n, avgHum: r.n_avg_hum, minHum: r.n_min_hum, maxHum: r.n_max_hum,
                 avgTemp: r.n_avg_temp, pctOver60: r.n_over60 },
      };
      split.verdict = analyzeDayNight(split.day, split.night);
    }

    // day x hour matrix for the heatmap (per day for week/month, per month for year)
    let heat = [];
    if (grain === "day") {
      heat = await sql`
        SELECT to_char(date_trunc('day', ts), 'YYYY-MM-DD') AS d, extract(hour from ts)::int AS h,
          round(avg(hum)::numeric, 1) AS v
        FROM readings
        WHERE ts >= ${start}::timestamp AND ts < ${end}::timestamp
          AND (${device}::text IS NULL OR device_mac = ${device})
        AND (${tod}::text = 'all'
          OR (${tod}::text = 'day' AND extract(hour from ts) BETWEEN 6 AND 17)
          OR (${tod}::text = 'night' AND (extract(hour from ts) < 6 OR extract(hour from ts) >= 18)))
        GROUP BY 1, 2 ORDER BY 1, 2`;
    } else if (grain === "month") {
      heat = await sql`
        SELECT to_char(date_trunc('month', ts), 'YYYY-MM') AS d, extract(hour from ts)::int AS h,
          round(avg(hum)::numeric, 1) AS v
        FROM readings
        WHERE ts >= ${start}::timestamp AND ts < ${end}::timestamp
          AND (${device}::text IS NULL OR device_mac = ${device})
        AND (${tod}::text = 'all'
          OR (${tod}::text = 'day' AND extract(hour from ts) BETWEEN 6 AND 17)
          OR (${tod}::text = 'night' AND (extract(hour from ts) < 6 OR extract(hour from ts) >= 18)))
        GROUP BY 1, 2 ORDER BY 1, 2`;
    }

    return json({ range, date, start, end, grain, label, tod, summary, points, hourly, dist, heat, split });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};
