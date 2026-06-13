# Netlify + Neon Humidity Dashboard — Design Spec

วันที่: 2026-06-13
สถานะ: อนุมัติแล้ว ("ทำเลย")

## เป้าหมาย
เปลี่ยนรายงานความชื้นห้องเก็บสีย้อม (static HTML เดิม) ให้เป็นเว็บแอปที่มีฐานข้อมูล:
- หน้า **อัปโหลดข้อมูล** (รับไฟล์ CSV จากเซนเซอร์ IBS-TH3-PLUS)
- เก็บข้อมูลลง **Neon Postgres (ฟรี)**
- หน้า **แดชบอร์ด** ดูสรุปได้ราย **วัน / สัปดาห์ / เดือน / ปี**

## การตัดสินใจที่ตกลงแล้ว
- โฮสต์: **Netlify (ฟรี) + Neon (ฟรี)** — static hosting + serverless functions
- อัปโหลด: **รองรับหลายรูปแบบ** — CSV เซนเซอร์ (UTF-16, Tab) และ CSV ธรรมดา (UTF-8, comma) — กันข้อมูลซ้ำอัตโนมัติด้วย primary key
- สิทธิ์: **ดูสาธารณะ** / **อัปโหลดต้องใส่รหัสผ่าน** (env `UPLOAD_PASSWORD`)
- ขอบเขต: **เซนเซอร์เดียว** ตอนนี้ แต่เก็บ `device_mac` ใน DB เผื่อขยายหลายห้องภายหลัง

## สถาปัตยกรรม (แนวทาง A)
หน้าเว็บ static เรียก Netlify Functions (`/api/*`) ซึ่งคุยกับ Neon
```
public/ (static, public)            netlify/functions/ (API)       Neon (Postgres)
  index.html  แดชบอร์ด        →   GET  /api/summary?range=&date=  →  readings (อ่าน, aggregate)
  upload.html อัปโหลด         →   POST /api/upload (รหัสผ่าน)     →  readings (insert, dedup)
                                   GET  /api/range                →  ช่วงวันที่ + จำนวนแถว
```

## โมเดลข้อมูล (Neon)
```sql
CREATE TABLE readings (
  device_mac text NOT NULL,
  ts         timestamp NOT NULL,   -- เวลาท้องถิ่น (ไม่มี tz, ตีความเป็นเวลาไทย)
  temp real, hum real, dew real, vpd real,
  PRIMARY KEY (device_mac, ts)
);
CREATE INDEX readings_ts_idx ON readings (ts);
```
- กันซ้ำ: `INSERT ... ON CONFLICT (device_mac, ts) DO NOTHING`
- Batch insert ด้วย `UNNEST(array...)` ครั้งละ ~5000 แถว (กัน N+1 timeout)
- สรุปคำนวณสดด้วย SQL (`date_trunc`, `avg/min/max`, `avg(case when hum>=60 ...)` สำหรับ % เกินเกณฑ์)

## API (Netlify Functions, ESM, Node 18+, `@neondatabase/serverless` http driver)
- `POST /api/upload` — header `x-upload-password`; body = ข้อความไฟล์ CSV; ตรวจรหัส → ตรวจรูปแบบ (BOM/UTF-16 vs UTF-8, tab vs comma) → parse → batch insert. คืน `{inserted, skipped, total, range}`
- `GET /api/summary?range=day|week|month|year&date=YYYY-MM-DD` — คืน `{range, start, end, points[], summary{}, buckets{}}`
  - day → จุดทุก 10 นาที (raw rows)
  - week/month → aggregate รายวัน
  - year → aggregate รายเดือน
  - summary: avg/min/max ของ hum & temp, pctOver60, pctOver70, count
- `GET /api/range` — `{minTs, maxTs, count, deviceMac}` ไว้กำหนดขอบเขต date picker
- ทุก error คืนเป็น JSON + HTTP status ที่เหมาะสม (ไม่คืน HTML)

## หน้าเว็บ
**index.html (แดชบอร์ด)** — ต่อยอดธีมสว่างเดิม
- ปุ่มสลับมุมมอง วัน/สัปดาห์/เดือน/ปี + เลื่อน ◀▶ + เลือกวันที่
- การ์ดสรุป (verdict เก็บสีย้อม, ความชื้น/อุณหภูมิ เฉลี่ย-ต่ำ-สูง, **% เวลาที่เกิน 60%**), กราฟ (Chart.js local), ตาราง
- วัน = กราฟเส้น 10 นาที, สัปดาห์/เดือน = แท่งรายวันสีตามระดับ, ปี = แท่งรายเดือน
- โหลดข้อมูลผ่าน fetch /api/*; destroy chart ก่อน re-render ทุกครั้ง

**upload.html** — ลากวางไฟล์ → ตรวจรูปแบบ + พรีวิว → ใส่รหัส → POST → แสดงผล (เพิ่มใหม่/ข้ามซ้ำ)

## ความปลอดภัย / ฟรี
- อัปโหลดตรวจรหัสจาก env; ดูเปิดสาธารณะ
- อยู่ในโควต้าฟรี Netlify (functions) + Neon (0.5GB)
- ไม่เรียก `process.exit` (พังบน serverless); static เสิร์ฟผ่าน publish dir ไม่ผ่าน function

## โครงไฟล์
```
netlify.toml · package.json · .env.example · migrate.js · seed.js
lib/parse.js  (parser หลายรูปแบบ + stats, ใช้ร่วม)
netlify/functions/{upload,summary,range}.js
public/{index.html,upload.html,app.js,styles.css,chart.umd.min.js,snapshot.html}
```
- คงไฟล์เดิม (parse.py, CSV) ไว้เป็น reference; รายงาน static เดิม → `public/snapshot.html`

## ขั้น deploy (คู่มือให้ผู้ใช้)
1. สร้าง Neon project (ฟรี) → คัดลอก connection string
2. รัน `node migrate.js` (ใส่ `DATABASE_URL`) สร้างตาราง
3. (ทางเลือก) `node seed.js <ไฟล์.csv>` นำเข้าข้อมูลเดิม
4. push GitHub → เชื่อม Netlify → ตั้ง env `DATABASE_URL`, `UPLOAD_PASSWORD` → deploy

## ทดสอบ
- parser: ทดสอบ local กับ CSV จริง (ทั้ง UTF-16/Tab และ UTF-8/comma) — นับแถว/ตรวจค่า
- ตรรกะ summary: ตรวจ aggregate กับชุดข้อมูลเล็ก
- ปลายทาง: ตรวจ upload→summary จริงหลังตั้ง Neon
```
