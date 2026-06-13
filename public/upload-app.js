// Upload page — parses CSV in the browser, then POSTs rows to /api/upload in chunks.
import { parseFile } from "./parse.js";

const el = (id) => document.getElementById(id);
const zone = el("zone"), fileInput = el("fileInput"), preview = el("preview");
const submitBtn = el("submit");
const progressWrap = el("progressWrap"), progressFill = el("progressFill"), result = el("result");
const TH_MON = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

let parsed = null; // { mac, rows, skipped }

function fmtDay(iso) { const d = new Date(iso); return d.getDate() + " " + TH_MON[d.getMonth()] + " " + (d.getFullYear() + 543); }

// Use a div + JS click (avoid label/input double-trigger).
zone.addEventListener("click", () => fileInput.click());
zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag"); });
zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
zone.addEventListener("drop", (e) => {
  e.preventDefault(); zone.classList.remove("drag");
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });

async function handleFile(file) {
  result.innerHTML = "";
  try {
    parsed = await parseFile(file);
  } catch (e) {
    showResult("err", "อ่านไฟล์ไม่สำเร็จ: " + e.message); return;
  }
  if (!parsed.rows.length) {
    showResult("err", "ไม่พบข้อมูลที่อ่านได้ในไฟล์นี้ (ตรวจรูปแบบไฟล์อีกครั้ง)");
    submitBtn.disabled = true; submitBtn.textContent = "เลือกไฟล์ก่อน";
    preview.classList.add("hidden");
    return;
  }
  const rows = parsed.rows;
  preview.classList.remove("hidden");
  preview.innerHTML = `
    <div class="row"><span>ไฟล์</span><b>${file.name}</b></div>
    <div class="row"><span>เซนเซอร์ (MAC)</span><b>${parsed.mac}</b></div>
    <div class="row"><span>จำนวนแถวที่อ่านได้</span><b>${rows.length.toLocaleString()} แถว</b></div>
    <div class="row"><span>ช่วงเวลา</span><b>${fmtDay(rows[0].ts)} – ${fmtDay(rows[rows.length-1].ts)}</b></div>
    ${parsed.skipped ? `<div class="row"><span>ข้ามแถวที่อ่านไม่ได้</span><b>${parsed.skipped}</b></div>` : ""}`;
  submitBtn.disabled = false; submitBtn.textContent = `บันทึก ${rows.length.toLocaleString()} แถวลงฐานข้อมูล`;
}

function showResult(kind, msg) { result.innerHTML = `<div class="result ${kind}">${msg}</div>`; }

submitBtn.addEventListener("click", async () => {
  if (!parsed || !parsed.rows.length) return;

  submitBtn.disabled = true; submitBtn.textContent = "กำลังบันทึก…";
  progressWrap.classList.remove("hidden"); result.innerHTML = "";
  const rows = parsed.rows, CH = 2000;
  let inserted = 0, skipped = 0, sent = 0;
  try {
    for (let i = 0; i < rows.length; i += CH) {
      const chunk = rows.slice(i, i + CH);
      const r = await fetch("/api/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mac: parsed.mac, rows: chunk }),
      });
      const j = await r.json().catch(() => ({ error: "การเชื่อมต่อผิดพลาด" }));
      if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
      inserted += j.inserted; skipped += j.skipped; sent += chunk.length;
      progressFill.style.width = Math.round((sent / rows.length) * 100) + "%";
    }
    showResult("ok", `✅ บันทึกสำเร็จ — เพิ่มใหม่ <b>${inserted.toLocaleString()}</b> แถว, ข้ามที่ซ้ำ <b>${skipped.toLocaleString()}</b> แถว<br>
      <a href="index.html">→ ไปดูแดชบอร์ด</a>`);
    submitBtn.textContent = "บันทึกอีกไฟล์";
    submitBtn.disabled = false;
  } catch (e) {
    showResult("err", "❌ " + e.message);
    submitBtn.disabled = false; submitBtn.textContent = "ลองอีกครั้ง";
  } finally {
    setTimeout(() => progressWrap.classList.add("hidden"), 600);
  }
});
