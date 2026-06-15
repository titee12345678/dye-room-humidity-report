# 🎨 Dye-Room Humidity Dashboard · แดชบอร์ดความชื้นห้องเก็บสีย้อม

เว็บแอปติดตามอุณหภูมิ/ความชื้นของ **ห้องเก็บสีย้อม** (สี Disperse / สีย้อมเส้นด้าย)
จากเซนเซอร์ **Inkbird IBS-TH3-PLUS** — อัปโหลดไฟล์ CSV เก็บลง **Neon Postgres** แล้วดูสรุปได้ราย **วัน / สัปดาห์ / เดือน / ปี**

> ทำไมต้องคุมความชื้น: สีผง โดยเฉพาะสี Disperse ไวต่อความชื้น+ความร้อน — ทำให้ **จับก้อน · เฉดเพี้ยน · ขึ้นรา**
> เกณฑ์ที่เหมาะกับการเก็บสีคือ **ความชื้นต่ำกว่า ~60%** และเก็บในที่เย็น

## สถาปัตยกรรม

```
public/  (เว็บ static, ดูสาธารณะ)        netlify/functions/ (API)         Neon Postgres
  index.html   แดชบอร์ด          ─→   GET  /api/summary?range=&date=  ─→  readings (อ่าน + aggregate)
  upload.html  อัปโหลด           ─→   POST /api/upload (ใส่รหัส)      ─→  readings (insert, กันซ้ำ)
                                       GET  /api/range                 ─→  ช่วงวันที่ที่มีข้อมูล
```
- โฮสต์ฟรี: **Netlify** (static + serverless functions) + **Neon** (Postgres ฟรี 0.5GB)
- อัปโหลดรองรับ CSV เซนเซอร์ (UTF-16/Tab) และ CSV ทั่วไป (UTF-8/comma) — parse ฝั่ง browser แล้วส่งเป็น JSON
- **เปิดให้ดูและอัปโหลดได้** (ไม่ต้องใส่รหัส)
- กันข้อมูลซ้ำด้วย primary key `(device_mac, ts)` + `ON CONFLICT DO NOTHING`
- **รองรับหลายเครื่อง/หลายห้อง** — เลือกดูแยกเครื่องบนแดชบอร์ด + ตั้งชื่อเครื่องได้ (ตาราง `devices`)
- ลิงก์แชร์มุมมองเฉพาะได้ เช่น `/?range=month&date=2026-06-01`

## โครงสร้างไฟล์
```
netlify.toml            ตั้งค่า publish=public, functions, redirect /api/*
package.json            ESM, dep: @neondatabase/serverless
migrate.js              สร้างตาราง (รันครั้งเดียว)
seed.js                 นำเข้าข้อมูลเดิมจาก data.json
shared/db.js            Neon client + json helper
shared/period.js        คำนวณช่วงวัน/สัปดาห์/เดือน/ปี → SQL bounds
netlify/functions/      range.js · summary.js · upload.js
public/                 index.html · upload.html · app.js · upload-app.js · parse.js · styles.css · chart.umd.min.js
public/snapshot.html    รายงาน static เดิม (เปิดออฟไลน์ได้)
parse.py · build.py · template.html · data.json · *.csv   เครื่องมือสร้าง snapshot/นำเข้าข้อมูลเดิม (reference)
docs/superpowers/specs/ เอกสารออกแบบ
```

## รันในเครื่อง (local dev)
```bash
npm install
cp .env.example .env          # ใส่ DATABASE_URL ของ Neon
npm run migrate               # สร้างตาราง readings
npm run seed                  # (ทางเลือก) นำเข้าข้อมูลเดิมจาก data.json
npx netlify dev               # เปิด http://localhost:8888
```

## Deploy ขึ้น Netlify + Neon (ฟรี)
1. **Neon** — สมัครที่ console.neon.tech → New Project (เลือก region Singapore) → คัดลอก **pooled connection string**
2. รันในเครื่อง: `npm install` → ใส่ `DATABASE_URL` ใน `.env` → `npm run migrate` → (ทางเลือก) `npm run seed`
3. **GitHub** — push repo นี้ (มีอยู่แล้ว)
4. **Netlify** — app.netlify.com → Add new site → Import จาก GitHub → เลือก repo
   - Environment variables: ตั้ง `DATABASE_URL` (จาก Neon)
   - Deploy → ได้ลิงก์ `https://<ชื่อ>.netlify.app`
5. เปิดลิงก์ → ถ้ายังว่าง ไปหน้า **อัปโหลด** เพื่อใส่ไฟล์ CSV (หรือใช้ `npm run seed` ก็ได้)

> หมายเหตุ: เวลาในข้อมูลเป็นเวลาท้องถิ่น (Asia/Bangkok) ปีในตารางแสดงเป็น พ.ศ.
