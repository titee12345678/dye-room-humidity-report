#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Embed data.json + Chart.js into template.html -> index.html (single self-contained file)."""

CDN = '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>'

tpl = open("template.html", encoding="utf-8").read()
data = open("data.json", encoding="utf-8").read()
chart = open("chartjs.min.js", encoding="utf-8").read()

assert CDN in tpl, "Chart.js CDN <script> tag not found in template.html"
tpl = tpl.replace(CDN, "<script>" + chart + "</script>")  # inline Chart.js (works offline)
html = tpl.replace("__DATA_PLACEHOLDER__", data)           # inline the dataset

with open("index.html", "w", encoding="utf-8") as f:
    f.write(html)

print("index.html built:", len(html), "bytes")
