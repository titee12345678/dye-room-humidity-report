#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, re, statistics
from datetime import datetime
from collections import defaultdict

SRC = "IBS-TH3-PLUS_05282026 00:00-06132026 23:59.csv"

# File is UTF-16 with tab separators
with open(SRC, "r", encoding="utf-16") as f:
    raw = f.read()

lines = [l for l in raw.splitlines() if l.strip()]

mac = ""
rows = []
for line in lines:
    if line.upper().startswith("MAC ADDRESS"):
        mac = line.split(":", 1)[1].strip()
        continue
    parts = line.split("\t")
    parts = [p.strip() for p in parts]
    if len(parts) < 5:
        continue
    if parts[0].lower().startswith("time"):
        continue
    t_str = parts[0]
    try:
        dt = datetime.strptime(t_str, "%m/%d/%Y %H:%M")
    except ValueError:
        continue
    def num(s):
        m = re.search(r"-?\d+\.?\d*", s)
        return float(m.group()) if m else None
    temp = num(parts[1])
    hum = num(parts[2])
    dew = num(parts[3])
    vpd = num(parts[4])
    if None in (temp, hum, dew, vpd):
        continue
    rows.append({
        "t": dt.isoformat(),
        "ts": int(dt.timestamp() * 1000),
        "temp": temp,
        "hum": hum,
        "dew": dew,
        "vpd": vpd,
    })

rows.sort(key=lambda r: r["ts"])

def stats(vals):
    return {
        "min": round(min(vals), 1),
        "max": round(max(vals), 1),
        "avg": round(statistics.mean(vals), 1),
        "median": round(statistics.median(vals), 1),
        "std": round(statistics.pstdev(vals), 2),
    }

temps = [r["temp"] for r in rows]
hums = [r["hum"] for r in rows]
dews = [r["dew"] for r in rows]
vpds = [r["vpd"] for r in rows]

# find timestamps of extremes
def extreme_time(key, func):
    target = func(r[key] for r in rows)
    for r in rows:
        if r[key] == target:
            return r["t"]
    return None

summary = {
    "temp": {**stats(temps), "minAt": extreme_time("temp", min), "maxAt": extreme_time("temp", max)},
    "hum":  {**stats(hums),  "minAt": extreme_time("hum", min),  "maxAt": extreme_time("hum", max)},
    "dew":  {**stats(dews),  "minAt": extreme_time("dew", min),  "maxAt": extreme_time("dew", max)},
    "vpd":  {**stats(vpds),  "minAt": extreme_time("vpd", min),  "maxAt": extreme_time("vpd", max)},
}

# Daily aggregation
daily = defaultdict(lambda: {"temp": [], "hum": [], "dew": [], "vpd": []})
for r in rows:
    day = r["t"][:10]
    for k in ("temp", "hum", "dew", "vpd"):
        daily[day][k].append(r[k])

daily_out = []
for day in sorted(daily.keys()):
    d = daily[day]
    daily_out.append({
        "date": day,
        "tempMin": round(min(d["temp"]),1), "tempMax": round(max(d["temp"]),1), "tempAvg": round(statistics.mean(d["temp"]),1),
        "humMin": round(min(d["hum"]),1),  "humMax": round(max(d["hum"]),1),  "humAvg": round(statistics.mean(d["hum"]),1),
        "dewAvg": round(statistics.mean(d["dew"]),1),
        "vpdAvg": round(statistics.mean(d["vpd"]),2),
        "n": len(d["temp"]),
    })

# Hour-of-day average pattern (across all days)
hourly = defaultdict(lambda: {"temp": [], "hum": []})
for r in rows:
    h = datetime.fromisoformat(r["t"]).hour
    hourly[h]["temp"].append(r["temp"])
    hourly[h]["hum"].append(r["hum"])
hourly_out = []
for h in range(24):
    if hourly[h]["temp"]:
        hourly_out.append({
            "hour": h,
            "tempAvg": round(statistics.mean(hourly[h]["temp"]),1),
            "humAvg": round(statistics.mean(hourly[h]["hum"]),1),
        })

# Humidity comfort distribution (4 buckets)
def bucket_hum(v):
    if v < 40: return "dry"        # <40 แห้ง
    if v < 60: return "ideal"      # 40-60 เหมาะสม
    if v < 70: return "humid"      # 60-70 ชื้น
    return "veryhigh"              # >=70 ชื้นมาก
hum_dist = defaultdict(int)
for v in hums:
    hum_dist[bucket_hum(v)] += 1

# Key insights
n = len(rows)
pct_veryhigh = round(100 * sum(1 for v in hums if v >= 70) / n, 1)
pct_ideal = round(100 * sum(1 for v in hums if 40 <= v < 60) / n, 1)
pct_humid = round(100 * sum(1 for v in hums if 60 <= v < 70) / n, 1)
pct_dry = round(100 * sum(1 for v in hums if v < 40) / n, 1)
insights = {
    "pctVeryHigh": pct_veryhigh,
    "pctHumid": pct_humid,
    "pctIdeal": pct_ideal,
    "pctDry": pct_dry,
}

meta = {
    "mac": mac,
    "source": SRC,
    "count": len(rows),
    "start": rows[0]["t"],
    "end": rows[-1]["t"],
    "intervalMin": 10,
}

# Compact parallel-array series to keep embedded payload small
series_compact = {
    "ts":   [r["ts"] for r in rows],
    "temp": [r["temp"] for r in rows],
    "hum":  [r["hum"] for r in rows],
    "dew":  [r["dew"] for r in rows],
    "vpd":  [r["vpd"] for r in rows],
}

out = {
    "meta": meta,
    "summary": summary,
    "insights": insights,
    "daily": daily_out,
    "hourly": hourly_out,
    "humDist": dict(hum_dist),
    "series": series_compact,
}

with open("data.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

print("Records:", len(rows))
print("Range:", rows[0]["t"], "->", rows[-1]["t"])
print("Days:", len(daily_out))
print("Temp  min/avg/max:", summary["temp"]["min"], summary["temp"]["avg"], summary["temp"]["max"])
print("Hum   min/avg/max:", summary["hum"]["min"], summary["hum"]["avg"], summary["hum"]["max"])
print("Dew   min/avg/max:", summary["dew"]["min"], summary["dew"]["avg"], summary["dew"]["max"])
print("VPD   min/avg/max:", summary["vpd"]["min"], summary["vpd"]["avg"], summary["vpd"]["max"])
print("Hum dist:", dict(hum_dist))
print("Insights:", insights)
print("JSON bytes:", len(json.dumps(out, separators=(',',':'))))
