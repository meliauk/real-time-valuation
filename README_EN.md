<br/>
<div align="center">
  <h1>
    <span style="font-size:2.2rem;font-weight:800;background:linear-gradient(135deg,#6366f1,#a855f7,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">JiGongBao</span>
  </h1>
  <p style="font-size:1rem;color:#94a3b8;margin:8px 0 20px;">
    Real-time Fund Valuation &nbsp;·&nbsp; Global Market Tracking &nbsp;·&nbsp; Financial News Aggregation
  </p>
  <p>
    <a href="README.md">中文</a>&nbsp;|&nbsp;<b>English</b>
  </p>
  <a href="https://L-newbie.github.io/real-time-valuation/">
    <img src="https://img.shields.io/badge/🚀_Live_Demo-Click_to_Visit-6366f1?style=for-the-badge&logo=github&logoColor=white&labelColor=1e293b" />
  </a>
  <br/><br/>
  <p>
    <img src="https://img.shields.io/badge/Vue_3-4FC08D?style=flat-square&logo=vue.js&logoColor=white" />
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" />
    <img src="https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white" />
    <img src="https://img.shields.io/badge/Pinia-FFD859?style=flat-square" />
    <img src="https://img.shields.io/badge/Element_Plus-409EFF?style=flat-square" />
    <img src="https://img.shields.io/badge/ECharts-AA344D?style=flat-square" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" />
  </p>
</div>

---

## ✨ Features

<table width="100%" align="center">
<tr>
<td width="50%" valign="top" style="background:#faf5ff;border-radius:12px;border-left:4px solid #a855f7;padding:14px 16px;">

<b style="font-size:1.05rem;color:#7e22ce;">📈 Real-time Fund Valuation</b><br/>
<span style="color:#64748b;">Track fund NAV changes intraday, auto-calculate daily P&L and cumulative returns</span>

<b style="color:#ec4899;">▌T+2 "Real-time"</b> weighted from holdings stocks' live change rates<br/>
<b style="color:#6366f1;">▌T+1 "Forecast"</b> computed solely from holdings, never overwrites fundgz estimate

</td>
<td width="50%" valign="top" style="background:#eff6ff;border-radius:12px;border-left:4px solid #3b82f6;padding:14px 16px;">

<b style="font-size:1.05rem;color:#1d4ed8;">💼 Portfolio Management</b><br/>
<span style="color:#64748b;">Record shares and cost basis, aggregated dashboard; yesterday's base auto-advances after T+1 confirmation, gap-day replay backfill</span>

<sub>Holding value · Daily P&L · Cumulative P&L · Composite return · Multi-dimensional sorting</sub>

</td>
</tr>
<tr><td colspan="2" style="height:10px;border:none;background:transparent;"></td></tr>
<tr>
<td width="50%" valign="top" style="background:#ecfdf5;border-radius:12px;border-left:4px solid #10b981;padding:14px 16px;">

<b style="font-size:1.05rem;color:#047857;">🌍 Global Indices</b><br/>
<span style="color:#64748b;">Real-time tracking of major global indices, custom watchlist, market open/close per local timezone</span>

<sub>A-shares · HK · US · Japan/Korea/Taiwan · Europe · Red-up green-down</sub>

</td>
<td width="50%" valign="top" style="background:#fffbeb;border-radius:12px;border-left:4px solid #f59e0b;padding:14px 16px;">

<b style="font-size:1.05rem;color:#b45309;">⭐ Stock Watchlist</b><br/>
<span style="color:#64748b;">Cross-market fuzzy search (code / pinyin / name), one-click add, real-time price and change rate</span>

<sub>A-shares · HK · US · Japan/Korea/Taiwan · Europe · Sorted by change rate</sub>

</td>
</tr>
<tr><td colspan="2" style="height:10px;border:none;background:transparent;"></td></tr>
<tr>
<td width="50%" valign="top" style="background:#fff1f2;border-radius:12px;border-left:4px solid #f43f5e;padding:14px 16px;">

<b style="font-size:1.05rem;color:#be123c;">📰 Financial News</b><br/>
<span style="color:#64748b;">Sina + Eastmoney + overseas RSS multi-source aggregation, timeline display, auto-refresh</span>

<sub>Keyword blacklist · Tag-based management · Auto-mark as read</sub>

</td>
<td width="50%" valign="top" style="background:#fdf4ff;border-radius:12px;border-left:4px solid #d946ef;padding:14px 16px;">

<b style="font-size:1.05rem;color:#a21caf;">📊 Trend Charts</b><br/>
<span style="color:#64748b;">Historical NAV chart + intraday mini sparklines, fund details on a single page</span>

<sub>Fund type · Size · Manager · Peer ranking · Performance evaluation · ECharts interactive</sub>

</td>
</tr>
<tr><td colspan="2" style="height:10px;border:none;background:transparent;"></td></tr>
<tr>
<td width="50%" valign="top" style="background:#f0f9ff;border-radius:12px;border-left:4px solid #0ea5e9;padding:14px 16px;">

<b style="font-size:1.05rem;color:#0369a1;">🧐 Holdings Transparency</b><br/>
<span style="color:#64748b;">Full holdings estimation + top-10 stocks real-time quotes, bidirectional sticky header</span>

<sub>Quarterly top-10 + full report scaled · Single-day NAV constrained optimization</sub>

</td>
<td width="50%" valign="top" style="background:#f0fdfa;border-radius:12px;border-left:4px solid #14b8a6;padding:14px 16px;">

<b style="font-size:1.05rem;color:#0f766e;">🖼️ Screenshot Import</b><br/>
<span style="color:#64748b;">Drag-and-drop or paste portfolio screenshots, vision model auto-recognition for batch import</span>

<sub>GLM-4V vision model · Batch import · Editable verification</sub>

</td>
</tr>
</table>



</details>

</details>

---

## 🚀 Deployment

<p align="center">
  <code>npm install</code>&nbsp;&nbsp;→&nbsp;&nbsp;<code>npm run dev</code>&nbsp;&nbsp;→&nbsp;&nbsp;Open browser
</p>

<p align="center" style="color:#888;font-size:0.9em;">
  Push to <code>master</code> branch, GitHub Actions auto-builds and deploys to Pages<br/>
</p>

---

<div align="center">
  <p>
    <img src="https://img.shields.io/github/license/L-newbie/real-time-valuation?style=flat-square&color=6366f1" />
    <img src="https://img.shields.io/github/stars/L-newbie/real-time-valuation?style=flat-square&color=eab308" />
    <img src="https://img.shields.io/github/issues/L-newbie/real-time-valuation?style=flat-square&color=ef4444" />
  </p>
  <p style="color:#64748b;font-size:0.9rem;margin-top:16px;">
    ⭐ Star this project if you find it helpful
  </p>
  <p style="color:#475569;font-size:0.8rem;">
    Feedback & issues via <a href="https://github.com/L-newbie/real-time-valuation/issues">Issue</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/L-newbie/real-time-valuation">GitHub</a>
  </p>
  <br/>
  <p style="color:#334155;font-size:0.75rem;">Made with ❤️ for A-share investors</p>
</div>