import { useState, useCallback, useRef, useEffect } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

const TC = { frp: "#378ADD", chisel: "#1D9E75", bore: "#D85A30", ngrok: "#7F77DD" };
const gc = t => TC[t?.toLowerCase()] || "#f472b6";

function calcScore(d) {
  let s = 0, m = 0; const cs = Object.keys(d.latency || {});
  const pl = d.packet_loss?.packet_loss_pct;
  if (pl != null && pl < 100) { m += 10; s += Math.max(0, 10 * (1 - pl / 10)); }
  const rtt = d.packet_loss?.rtt_avg_ms;
  if (rtt != null) { m += 5; s += Math.max(0, 5 * (1 - Math.min(rtt / 300, 1))); }
  cs.forEach(c => { const v = d.latency?.[c]?.avg_ms; if (v != null) { m += 10; s += Math.max(0, 10 * (1 - Math.min(v / 10000, 1))); } });
  cs.forEach(c => { const v = d.latency?.[c]?.jitter_ms; if (v != null) { m += 5; s += Math.max(0, 5 * (1 - Math.min(v / 1000, 1))); } });
  cs.forEach(c => { const v = d.connection_setup?.[c]?.avg_ms; if (v != null) { m += 5; s += Math.max(0, 5 * (1 - Math.min(v / 15000, 1))); } });
  cs.forEach(c => { const v = d.uptime?.[c]?.uptime_pct; if (v != null) { m += 12.5; s += v / 100 * 12.5; } });
  cs.forEach(c => { const st = d.stability?.[c]; if (st) { m += 5; s += st.verdict === "STABLE" && st.error_count === 0 ? 5 : st.verdict === "MOSTLY_STABLE" ? 3 : st.verdict === "STABLE" ? 4 : 0; } });
  const ms = d.multi_stream; if (ms) { m += 5; s += ms.verdict === "OK" && ms.total_frames > 0 && ms.total_drops === 0 ? 5 : ms.verdict === "OK" && ms.total_frames > 0 ? 3 : 0; }
  const cpu = d.resource_usage?.cpu_avg_pct; if (cpu != null) { m += 5; s += Math.max(0, 5 * (1 - Math.min(cpu / 5, 1))); }
  return m > 0 ? Math.round(s / m * 100) : 0;
}

// Charts handled by react-chartjs-2

function Donut({ value, color, size = 50, track = "#1e293b" }) {
  const r = (size - 6) / 2, ci = 2 * Math.PI * r, o = ci * (1 - Math.min(value / 100, 1));
  return <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={track} strokeWidth={5} /><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5} strokeDasharray={ci} strokeDashoffset={o} strokeLinecap="round" /></svg>;
}

function Bx({ title, children, t }) {
  return <div style={{ background: t?.boxBg || "#0a0e17", borderRadius: 8, padding: "10px 12px" }}><div style={{ fontSize: 9, color: t?.dim || "#475569", textTransform: "uppercase", marginBottom: 6, fontWeight: 600 }}>{title}</div>{children}</div>;
}

function Modal({ data, label, color, vps, onClose, t }) {
  if (!data) return null;
  const score = calcScore(data), cams = Object.keys(data.latency || {});
  const sc = v => v === "STABLE" ? "#34d399" : v === "MOSTLY_STABLE" ? "#fbbf24" : "#f87171";
  const uc = v => v >= 99 ? "#34d399" : v >= 95 ? "#fbbf24" : "#f87171";
  const ru = data.resource_usage || {}, vr = vps?.resource_usage || {}, ve = vps?.events || {};
  const T = t || {};
  return (
    <div style={{ position: "fixed", inset: 0, background: T.modalBg || "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "28px 16px", overflowY: "auto" }} onClick={onClose}>
      <div style={{ background: T.card || "#111827", border: `1px solid ${color}44`, borderRadius: 16, padding: 22, maxWidth: 860, width: "100%" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ position: "relative" }}><Donut value={score} color={color} track={T.border || "#1e293b"} /><div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 13, fontWeight: 700, color }}>{score}</div></div>
            <div><div style={{ fontSize: 17, fontWeight: 700, color }}>{label}</div><div style={{ fontSize: 10, color: T.dim }}>{data.meta?.timestamp}</div></div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.muted, padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 16 }}>X</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 9, marginBottom: 14 }}>
          <Bx t={T} title="Packet Loss"><div style={{ fontSize: 20, fontWeight: 700, color: data.packet_loss?.packet_loss_pct === 0 ? "#34d399" : data.packet_loss?.packet_loss_pct === 100 ? "#475569" : "#f87171" }}>{data.packet_loss?.packet_loss_pct === 100 ? "ICMP blocked" : `${data.packet_loss?.packet_loss_pct ?? "-"}%`}</div>{data.packet_loss?.rtt_avg_ms && <div style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>RTT: {data.packet_loss.rtt_avg_ms}ms</div>}</Bx>
          <Bx t={T} title="Multi-Stream"><div style={{ fontSize: 13, fontWeight: 700, color: data.multi_stream?.verdict === "OK" && data.multi_stream?.total_frames > 0 ? "#34d399" : "#fbbf24" }}>{data.multi_stream?.verdict ?? "-"}</div><div style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>{data.multi_stream?.total_frames ?? 0} fr / {data.multi_stream?.total_drops ?? 0} drops</div></Bx>
          <Bx t={T} title="Resource">{ru.error ? <span style={{ fontSize: 11, color: T.dim }}>{ru.error}</span> : <><div style={{ fontSize: 11, color: T.muted }}>CPU: {ru.cpu_avg_pct}% / max {ru.cpu_max_pct}%</div><div style={{ fontSize: 11, color: T.muted }}>MEM: {ru.mem_avg_pct}%</div></>}</Bx>
        </div>
        {cams.map(cam => {
          const la = data.latency?.[cam] || {}, cs = data.connection_setup?.[cam] || {}, st = data.stability?.[cam] || {}, ut = data.uptime?.[cam] || {};
          return <div key={cam} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 7 }}>CAM: {cam.toUpperCase()} <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 99, background: sc(st.verdict) + "22", color: sc(st.verdict), fontWeight: 600, marginLeft: 4 }}>{st.verdict || "N/A"}</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(115px, 1fr))", gap: 8 }}>
              <Bx t={T} title="Latency"><div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{la.avg_ms ?? "-"} ms</div><div style={{ fontSize: 9, color: T.muted }}>min {la.min_ms ?? "-"} / max {la.max_ms ?? "-"}</div></Bx>
              <Bx t={T} title="Jitter"><div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{la.jitter_ms ?? "-"} ms</div></Bx>
              <Bx t={T} title="Setup"><div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{cs.avg_ms ?? "-"} ms</div></Bx>
              <Bx t={T} title="Drops"><div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{st.dropped_frames ?? 0}/{st.total_frames ?? 0}</div><div style={{ fontSize: 9, color: T.muted }}>{st.drop_rate_pct ?? 0}% rate</div></Bx>
              <Bx t={T} title="Uptime"><div style={{ fontSize: 15, fontWeight: 700, color: uc(ut.uptime_pct ?? 0) }}>{ut.uptime_pct ?? "-"}%</div><div style={{ fontSize: 9, color: T.muted }}>{ut.up ?? 0}/{ut.total_checks ?? 0}</div></Bx>
            </div>
          </div>;
        })}
        {vps && <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#fb923c", marginBottom: 7 }}>VPS SERVER <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 99, background: (vps.tunnel_verdict === "STABLE" ? "#34d399" : "#fbbf24") + "22", color: vps.tunnel_verdict === "STABLE" ? "#34d399" : "#fbbf24" }}>{vps.tunnel_verdict}</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
            <Bx t={T} title="Score">{vps.tunnel_stability_score}/100</Bx>
            <Bx t={T} title="Events"><div style={{ fontSize: 10, color: T.muted }}>C:{ve.connects} D:{ve.disconnects} E:{ve.errors} R:{ve.reconnects}</div></Bx>
            {vr.cpu && <Bx t={T} title="CPU/MEM"><div style={{ fontSize: 10, color: T.muted }}>CPU:{vr.cpu.avg_pct}% MEM:{vr.memory?.avg_pct}%</div></Bx>}
            {vr.bandwidth && <Bx t={T} title="BW"><div style={{ fontSize: 10, color: T.muted }}>RX:{vr.bandwidth.total_rx_mb}MB TX:{vr.bandwidth.total_tx_mb}MB</div></Bx>}
          </div>
        </div>}
      </div>
    </div>
  );
}

function findWin(tools, gv, better) {
  if (better === "text") {
    const vs = tools.map(t => ({ n: t.name, v: gv(t) }));
    const good = vs.filter(v => typeof v.v === "string" && (v.v.startsWith("STABLE") || (v.v.startsWith("OK") && !v.v.includes("0 frames"))));
    if (good.length > 0 && good.length < vs.length) return good.map(v => v.n).join("/");
    return "Draw";
  }
  const vs = tools.map(t => ({ n: t.name, v: gv(t) })).filter(v => typeof v.v === "number");
  if (!vs.length) return null;
  const best = better === "high" ? Math.max(...vs.map(v => v.v)) : Math.min(...vs.map(v => v.v));
  const ws = vs.filter(v => Math.abs(v.v - best) < 0.01);
  return ws.length === vs.length ? "Draw" : ws.map(w => w.n).join("/");
}

export default function App() {
  const [r30, s30] = useState([]); const [r50, s50] = useState([]);
  const [v30, sv30] = useState([]); const [v50, sv50] = useState([]);
  const [tab, sTab] = useState("compare"); const [modal, sMod] = useState(null);
  const [drag, sDrag] = useState(false); const [err, sErr] = useState(null);
  const [dark, setDark] = useState(() => {
    const saved = window.localStorage?.getItem?.("theme");
    if (saved) return saved === "dark";
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches !== false;
  });
  const cReady = true; const fRef = useRef(null);

  const T = dark ? {
    bg: "#0a0e17", card: "#111827", border: "#1e293b", text: "#e2e8f0", muted: "#94a3b8",
    dim: "#475569", cardHover: "#1a1a3e", boxBg: "#0a0e17", chartText: "#d1d5db",
    chartGrid: "rgba(255,255,255,0.06)", tabActive: "#22d3ee18", tabBorder: "#22d3ee44",
    accent: "#22d3ee", modalBg: "rgba(0,0,0,0.8)", dropBorder: "#1e293b", dropBorderHover: "#22d3ee",
  } : {
    bg: "#f8fafc", card: "#ffffff", border: "#e2e8f0", text: "#1e293b", muted: "#64748b",
    dim: "#94a3b8", cardHover: "#f1f5f9", boxBg: "#f1f5f9", chartText: "#4b5563",
    chartGrid: "rgba(0,0,0,0.06)", tabActive: "#0891b218", tabBorder: "#0891b244",
    accent: "#0891b2", modalBg: "rgba(0,0,0,0.5)", dropBorder: "#cbd5e1", dropBorderHover: "#0891b2",
  };

  useEffect(() => { try { window.localStorage?.setItem?.("theme", dark ? "dark" : "light"); } catch(e){} }, [dark]);

  const addR = useCallback((txt, fn) => {
    try {
      const p = JSON.parse(txt); if (!p.meta?.tool) throw new Error("No meta.tool");
      const is5 = fn?.includes("50m") || JSON.stringify(p.meta).includes("50m");
      if (p.meta?.side === "server") { (is5 ? sv50 : sv30)(pr => [...pr.filter(r => r.meta.tool !== p.meta.tool), p]); }
      else { (is5 ? s50 : s30)(pr => [...pr.filter(r => r.meta.tool !== p.meta.tool), p]); }
      sErr(null);
    } catch (e) { sErr(e.message); }
  }, []);
  const hFiles = useCallback(fs => { Array.from(fs).forEach(f => { const r = new FileReader(); r.onload = e => addR(e.target.result, f.name); r.readAsText(f); }); }, [addR]);
  const hDrop = useCallback(e => { e.preventDefault(); sDrag(false); hFiles(e.dataTransfer.files); }, [hFiles]);

  const names = [...new Set([...r30.map(r => r.meta.tool), ...r50.map(r => r.meta.tool)])];
  const tools = names.map(n => ({
    name: n, color: gc(n),
    d30: r30.find(r => r.meta.tool === n), d50: r50.find(r => r.meta.tool === n),
    v30: v30.find(r => r.meta.tool === n), v50: v50.find(r => r.meta.tool === n),
    s30: r30.find(r => r.meta.tool === n) ? calcScore(r30.find(r => r.meta.tool === n)) : null,
    s50: r50.find(r => r.meta.tool === n) ? calcScore(r50.find(r => r.meta.tool === n)) : null,
  })).map(t => ({ ...t, best: Math.max(t.s30 || 0, t.s50 || 0) })).sort((a, b) => {
    if (b.best !== a.best) return b.best - a.best;
    return (b.s50 || 0) - (a.s50 || 0);
  });

  const cams = tools.length > 0 ? Object.keys((tools[0].d50 || tools[0].d30)?.latency || {}) : [];
  const hasAny = r30.length + r50.length > 0;
  const M = ["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49", "4\uFE0F\u20E3"];
  const tx = T.chartText, gr = T.chartGrid;
  const ft = "'JetBrains Mono','SF Mono',monospace";
  const fm = v => v != null ? (typeof v === "number" ? Math.round(v * 100) / 100 : v) : "-";

  const tabStyle = (k) => ({ background: tab === k ? T.tabActive : "transparent", border: `1px solid ${tab === k ? T.tabBorder : T.border}`, color: tab === k ? T.accent : T.muted, padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: ft, fontWeight: tab === k ? 600 : 400 });

  // For compare tab: use 50m data primarily, fallback 30m
  const cmpTools = tools.map(t => ({ ...t, data: t.d50 || t.d30, vps: t.v50 || t.v30, score: t.best }));

  return (
    <div style={{ fontFamily: ft, background: T.bg, color: T.text, minHeight: "100vh", padding: "24px 20px", transition: "background 0.3s, color 0.3s" }}>
      {/* styles in public/index.html */}

      {/* Theme toggle */}
      <button onClick={() => setDark(d => !d)} style={{ position: "fixed", top: 16, right: 16, zIndex: 999, background: T.card, border: `1px solid ${T.border}`, color: T.muted, padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontFamily: ft }} title="Toggle theme">
        {dark ? "☀️" : "🌙"}
      </button>

      {!hasAny ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh", gap: 20 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.15em", color: T.dim, textTransform: "uppercase", fontWeight: 600 }}>Tunnel Benchmark Dashboard</div>
          <div style={{ fontSize: 12, color: T.muted, maxWidth: 460, textAlign: "center", lineHeight: 1.6 }}>
            Drop all report files: <span style={{ color: "#fbbf24" }}>30m</span>, <span style={{ color: "#22d3ee" }}>50m</span>, client + VPS. Auto-detected by filename.
          </div>
          <div onDragOver={e => { e.preventDefault(); sDrag(true); }} onDragLeave={() => sDrag(false)} onDrop={hDrop} onClick={() => fRef.current?.click()}
            style={{ border: `2px dashed ${drag ? T.dropBorderHover : T.dropBorder}`, borderRadius: 16, padding: "48px 60px", textAlign: "center", cursor: "pointer" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>Drop files here</div>
            <div style={{ fontSize: 12, color: T.dim }}>50m in filename = 50 min | vps in filename = server data</div>
            <input ref={fRef} type="file" accept=".json" multiple style={{ display: "none" }} onChange={e => { hFiles(e.target.files); e.target.value = ""; }} />
          </div>
          {err && <div style={{ color: "#f87171", fontSize: 12 }}>{err}</div>}
        </div>
      ) : (
        <div style={{ maxWidth: 940, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", color: T.dim, textTransform: "uppercase", fontWeight: 600, marginBottom: 3 }}>Tunnel Benchmark</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#22d3ee" }}>{tools.map(t => t.name.toUpperCase()).join(" | ")}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <div onDragOver={e => { e.preventDefault(); sDrag(true); }} onDragLeave={() => sDrag(false)} onDrop={hDrop} onClick={() => fRef.current?.click()}
                style={{ background: T.card, border: `1px solid ${T.border}`, color: T.muted, padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: ft }}>+<input ref={fRef} type="file" accept=".json" multiple style={{ display: "none" }} onChange={e => { hFiles(e.target.files); e.target.value = ""; }} /></div>
              <button onClick={() => { s30([]); s50([]); sv30([]); sv50([]); sMod(null); }} style={{ background: T.card, border: `1px solid ${T.border}`, color: T.muted, padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: ft }}>Reset</button>
            </div>
          </div>

          {/* File counts */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, fontSize: 11 }}>
            <span style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 10px" }}><span style={{ color: "#fbbf24" }}>30m:</span> {r30.length}+{v30.length}vps</span>
            <span style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 10px" }}><span style={{ color: "#22d3ee" }}>50m:</span> {r50.length}+{v50.length}vps</span>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
            <button onClick={() => sTab("compare")} style={tabStyle("compare")}>Compare (Best)</button>
            <button onClick={() => sTab("30v50")} style={tabStyle("30v50")}>30m vs 50m</button>
            <button onClick={() => sTab("vps")} style={tabStyle("vps")}>VPS Server</button>
          </div>

          {/* ═══ COMPARE TAB ═══ */}
          {tab === "compare" && <>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(cmpTools.length, 4)}, 1fr)`, gap: 10, marginBottom: 20 }}>
              {cmpTools.map((t, i) => (
                <div key={t.name} onClick={() => sMod({ data: t.data, label: t.name.toUpperCase(), color: t.color, vps: t.vps })}
                  style={{ background: T.card, border: `${i === 0 ? 2 : 1}px solid ${i === 0 ? t.color + "66" : "#1e293b"}`, borderRadius: 12, padding: 16, textAlign: "center", cursor: "pointer", transition: "transform 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"} onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
                  <div style={{ fontSize: 22 }}>{M[i] || `#${i+1}`}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: t.color, marginTop: 4 }}>{t.name.toUpperCase()}</div>
                  <div style={{ position: "relative", margin: "10px auto", width: 56, height: 56 }}>
                    <Donut value={t.score} color={t.color} size={56} track={T.border} />
                    <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 15, fontWeight: 700, color: t.color }}>{t.score}</div>
                  </div>
                  <div style={{ fontSize: 9, color: T.dim }}>click for detail</div>
                </div>
              ))}
            </div>

            {/* Bar chart */}
            {cReady && <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18, marginBottom: 14, height: Math.max(240, cams.length * 3 * cmpTools.length * 16 + 80) }}>
              <Bar data={{ labels: [...cams.flatMap(c => [`Lat ${c}`, `Jit ${c}`, `Setup ${c}`]), "CPU%"],
                  datasets: cmpTools.map(t => ({ label: t.name.toUpperCase(), backgroundColor: t.color + "CC", borderRadius: 4,
                    data: [...cams.flatMap(c => [t.data?.latency?.[c]?.avg_ms ?? 0, t.data?.latency?.[c]?.jitter_ms ?? 0, t.data?.connection_setup?.[c]?.avg_ms ?? 0]), t.data?.resource_usage?.cpu_avg_pct ?? 0] })) }}
                options={{ responsive: true, maintainAspectRatio: false, indexAxis: "y",
                  plugins: { legend: { display: false }, title: { display: true, text: "Key metrics (lower = better)", color: tx, font: { size: 12, weight: "500" } } },
                  scales: { x: { ticks: { color: tx }, grid: { color: gr } }, y: { ticks: { color: tx, font: { size: 10 } }, grid: { display: false } } } }}
              />
            </div>}

            {/* Verdict table */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", color: T.dim, fontWeight: 600, marginBottom: 12 }}>Final verdict</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead><tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    <th style={{ textAlign: "left", padding: "6px 6px 6px 0", color: T.dim }}>Metric</th>
                    {cmpTools.map(t => <th key={t.name} style={{ textAlign: "center", padding: "6px 3px", color: t.color, fontWeight: 700 }}>{t.name.toUpperCase()}</th>)}
                    <th style={{ textAlign: "center", padding: "6px 0", color: T.dim }}>Best</th>
                  </tr></thead>
                  <tbody>
                    {[
                      { l: "Score", g: t => t.score, s: "/100", b: "high" },
                      ...cams.flatMap(c => [
                        { l: `Lat ${c}`, g: t => t.data?.latency?.[c]?.avg_ms, s: "ms", b: "low" },
                        { l: `Jit ${c}`, g: t => t.data?.latency?.[c]?.jitter_ms, s: "ms", b: "low" },
                        { l: `Setup ${c}`, g: t => t.data?.connection_setup?.[c]?.avg_ms, s: "ms", b: "low" },
                        { l: `Up ${c}`, g: t => t.data?.uptime?.[c]?.uptime_pct, s: "%", b: "high" },
                      ]),
                      { l: "Multi", g: t => { const m = t.data?.multi_stream; return m?.total_frames > 0 ? `OK(${m.total_drops}d)` : m?.verdict || "-"; }, s: "", b: "text" },
                      { l: "CPU", g: t => t.data?.resource_usage?.cpu_avg_pct, s: "%", b: "low" },
                    ].map(row => {
                      const w = findWin(cmpTools, row.g, row.b);
                      return <tr key={row.l} style={{ borderBottom: `1px solid ${T.border}` }}>
                        <td style={{ padding: "5px 6px 5px 0", color: T.muted }}>{row.l}</td>
                        {cmpTools.map(t => {
                          const v = row.g(t); const isW = w && w !== "Draw" && w.includes(t.name);
                          let d = v != null ? (typeof v === "number" ? `${fm(v)}${row.s}` : v) : "-";
                          if (row.l === "Lat " || row.l.startsWith("Lat")) { if (v === null && t.data?.packet_loss?.packet_loss_pct === 100) d = "-"; }
                          return <td key={t.name} style={{ textAlign: "center", padding: "5px 3px", color: isW ? "#34d399" : v == null ? T.dim : T.text, fontWeight: isW ? 700 : 400 }}>{d}{isW ? " *" : ""}</td>;
                        })}
                        <td style={{ textAlign: "center", padding: "5px 0", color: w === "Draw" ? T.muted : cmpTools.find(t => t.name === w?.split("/")[0])?.color || T.muted, fontWeight: 500, fontSize: 10 }}>{w || "-"}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
              {cmpTools.length > 1 && <div style={{ marginTop: 12, padding: "10px 14px", background: cmpTools[0].color + "12", border: `1px solid ${cmpTools[0].color}33`, borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: cmpTools[0].color }}>Recommendation: {cmpTools[0].name.toUpperCase()} ({cmpTools[0].score}/100)</div>
                <div style={{ fontSize: 10, color: T.muted }}>{cmpTools[1] && `Runner-up: ${cmpTools[1].name.toUpperCase()} (${cmpTools[1].score}/100)`}</div>
              </div>}
            </div>
          </>}

          {/* ═══ 30m vs 50m TAB ═══ */}
          {tab === "30v50" && <>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(tools.length, 4)}, 1fr)`, gap: 10, marginBottom: 20 }}>
              {tools.map((t, i) => (
                <div key={t.name} style={{ background: T.card, border: `1px solid #1e293b`, borderRadius: 12, padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 22 }}>{M[i]}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.color, marginTop: 4 }}>{t.name.toUpperCase()}</div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 10 }}>
                    <div onClick={() => t.d30 && sMod({ data: t.d30, label: `${t.name.toUpperCase()} 30m`, color: "#fbbf24", vps: t.v30 })} style={{ cursor: t.d30 ? "pointer" : "default", opacity: t.s30 != null ? 1 : 0.3 }}>
                      <div style={{ position: "relative", width: 42, height: 42, margin: "0 auto" }}><Donut value={t.s30 ?? 0} color="#fbbf24" size={42} track={T.border} /><div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 11, fontWeight: 700, color: "#fbbf24" }}>{t.s30 ?? "-"}</div></div>
                      <div style={{ fontSize: 9, color: T.dim, marginTop: 2 }}>30m</div>
                    </div>
                    <div onClick={() => t.d50 && sMod({ data: t.d50, label: `${t.name.toUpperCase()} 50m`, color: "#22d3ee", vps: t.v50 })} style={{ cursor: t.d50 ? "pointer" : "default", opacity: t.s50 != null ? 1 : 0.3 }}>
                      <div style={{ position: "relative", width: 42, height: 42, margin: "0 auto" }}><Donut value={t.s50 ?? 0} color="#22d3ee" size={42} track={T.border} /><div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 11, fontWeight: 700, color: "#22d3ee" }}>{t.s50 ?? "-"}</div></div>
                      <div style={{ fontSize: 9, color: T.dim, marginTop: 2 }}>50m</div>
                    </div>
                  </div>
                  {t.s30 != null && t.s50 != null && <div style={{ fontSize: 10, marginTop: 6, color: t.s50 >= t.s30 ? "#34d399" : "#f87171", fontWeight: 600 }}>{t.s50 > t.s30 ? `+${t.s50 - t.s30}` : t.s50 < t.s30 ? `${t.s50 - t.s30}` : "="}</div>}
                </div>
              ))}
            </div>

            {/* Latency charts 30v50 */}
            {cReady && cams.map(cam => {
              const ds = [];
              tools.forEach(t => {
                if (t.d30?.latency?.[cam]?.samples?.length > 1) ds.push({ label: `${t.name} 30m`, data: t.d30.latency[cam].samples, borderColor: t.color, borderDash: [5, 3], borderWidth: 1.5, pointRadius: 1, tension: 0.3, fill: false });
                if (t.d50?.latency?.[cam]?.samples?.length > 1) ds.push({ label: `${t.name} 50m`, data: t.d50.latency[cam].samples, borderColor: t.color, borderWidth: 2, pointRadius: 2, tension: 0.3, fill: false });
              });
              if (!ds.length) return null;
              const ml = Math.max(...ds.map(d => d.data.length));
              return <div key={cam} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18, marginBottom: 14, height: 280 }}>
                <Line data={{ labels: Array.from({ length: ml }, (_, i) => i + 1), datasets: ds }}
                  options={{ responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: true, labels: { color: tx, font: { size: 9 }, boxWidth: 10 } }, title: { display: true, text: `Latency ${cam} (dashed=30m, solid=50m)`, color: tx, font: { size: 12, weight: "500" } } },
                    scales: { x: { ticks: { color: tx }, grid: { color: gr } }, y: { ticks: { color: tx }, grid: { color: gr } } } }} />
              </div>;
            })}

            {/* 30v50 detail table */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", color: T.dim, fontWeight: 600, marginBottom: 12 }}>30m vs 50m detail</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                  <thead><tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    <th style={{ textAlign: "left", padding: "5px 4px 5px 0", color: T.dim }}>Metric</th>
                    {tools.map(t => <th key={t.name} style={{ textAlign: "center", padding: "5px 3px", color: t.color, fontWeight: 700 }}>{t.name.toUpperCase()}</th>)}
                  </tr></thead>
                  <tbody>
                    {[
                      { l: "Score", g: d => calcScore(d), s: "", lb: false },
                      ...cams.flatMap(c => [
                        { l: `Lat ${c}`, g: d => d.latency?.[c]?.avg_ms, s: "", lb: true },
                        { l: `Jit ${c}`, g: d => d.latency?.[c]?.jitter_ms, s: "", lb: true },
                        { l: `Setup ${c}`, g: d => d.connection_setup?.[c]?.avg_ms, s: "", lb: true },
                        { l: `Up ${c}`, g: d => d.uptime?.[c]?.uptime_pct, s: "%", lb: false },
                      ]),
                      { l: "CPU", g: d => d.resource_usage?.cpu_avg_pct, s: "%", lb: true },
                    ].map(row => (
                      <tr key={row.l} style={{ borderBottom: `1px solid ${T.border}` }}>
                        <td style={{ padding: "4px 4px 4px 0", color: T.muted }}>{row.l}</td>
                        {tools.map(t => {
                          const a = t.d30 ? row.g(t.d30) : null, b = t.d50 ? row.g(t.d50) : null;
                          const delta = (typeof a === "number" && typeof b === "number") ? (() => {
                            const d = b - a, p = a !== 0 ? Math.round(Math.abs(d) / Math.abs(a) * 100) : 0;
                            const good = row.lb ? d < 0 : d > 0;
                            return <span style={{ fontSize: 9, color: good ? "#34d399" : p < 3 ? T.muted : "#f87171", fontWeight: 600, marginLeft: 3 }}>{good ? "\u2193" : "\u2191"}{p}%</span>;
                          })() : null;
                          return <td key={t.name} style={{ textAlign: "center", padding: "4px 3px" }}>
                            <div style={{ color: T.muted }}>{fm(a)}{a != null ? row.s : ""} <span style={{ fontSize: 8, color: T.dim }}>30</span></div>
                            <div style={{ color: T.text, fontWeight: 600 }}>{fm(b)}{b != null ? row.s : ""} <span style={{ fontSize: 8, color: T.dim }}>50</span>{delta}</div>
                          </td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>}

          {/* ═══ VPS TAB ═══ */}
          {tab === "vps" && <>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>Server-side monitoring data (FRP & Chisel only — Ngrok/Bore use managed infrastructure)</div>
            {tools.filter(t => t.v30 || t.v50).length === 0 ? (
              <div style={{ background: T.card, border: "1px dashed #1e293b", borderRadius: 12, padding: 40, textAlign: "center", color: T.dim }}>No VPS reports uploaded. Drop vps_report.json files here.</div>
            ) : tools.filter(t => t.v30 || t.v50).map(t => (
              <div key={t.name} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18, marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.color, marginBottom: 12 }}>{t.name.toUpperCase()} — VPS Server</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[{ d: t.v30, label: "30m", clr: "#fbbf24" }, { d: t.v50, label: "50m", clr: "#22d3ee" }].map(({ d, label, clr }) => {
                    if (!d) return <div key={label} style={{ opacity: 0.3, padding: 12, background: T.boxBg, borderRadius: 8 }}><div style={{ color: clr, fontSize: 12, fontWeight: 600 }}>{label} — no data</div></div>;
                    const vr = d.resource_usage || {}, ve = d.events || {};
                    return <div key={label} style={{ padding: 12, background: T.boxBg, borderRadius: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ color: clr, fontSize: 12, fontWeight: 600 }}>{label}</span>
                        <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 99, background: (d.tunnel_verdict === "STABLE" ? "#34d399" : "#fbbf24") + "22", color: d.tunnel_verdict === "STABLE" ? "#34d399" : "#fbbf24", fontWeight: 600 }}>{d.tunnel_verdict}</span>
                        <span style={{ fontSize: 10, color: T.muted }}>Score: {d.tunnel_stability_score}/100</span>
                      </div>
                      <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.8 }}>
                        Events: C:{ve.connects} D:{ve.disconnects} E:{ve.errors} R:{ve.reconnects}<br/>
                        {vr.cpu && <>CPU: {vr.cpu.avg_pct}% avg / {vr.cpu.max_pct}% max<br/></>}
                        {vr.memory && <>MEM: {vr.memory.avg_pct}% avg<br/></>}
                        {vr.bandwidth && <>BW: RX {vr.bandwidth.total_rx_mb}MB / TX {vr.bandwidth.total_tx_mb}MB<br/>Rate: {vr.bandwidth.avg_rx_kbps}/{vr.bandwidth.avg_tx_kbps} kbps<br/></>}
                        {vr.connections && <>Connections: avg {vr.connections.avg} / max {vr.connections.max}</>}
                      </div>
                    </div>;
                  })}
                </div>
              </div>
            ))}
          </>}

          {modal && <Modal data={modal.data} label={modal.label} color={modal.color} vps={modal.vps} onClose={() => sMod(null)} t={T} />}
        </div>
      )}
    </div>
  );
}
