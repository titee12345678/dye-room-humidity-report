import { sql, json } from "../../shared/db.js";

// GET /api/range -> available data span, used to bound the date pickers.
export default async () => {
  try {
    const r = (await sql`
      SELECT to_char(min(ts), 'YYYY-MM-DD') AS min_d,
             to_char(max(ts), 'YYYY-MM-DD') AS max_d,
             count(*)::int AS n,
             max(device_mac) AS device
      FROM readings`)[0];
    return json({
      minDate: r.min_d, maxDate: r.max_d, count: r.n, deviceMac: r.device,
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};
