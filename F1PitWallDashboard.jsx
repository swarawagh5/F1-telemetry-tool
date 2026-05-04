import { useState, useEffect, useRef } from "react";

// ── SIMULATED DATA ─────────────────────────────────────────────────────────
// In the real Streamlit app, this comes from FastF1.
// Here we generate realistic F1 telemetry curves for the demo.

const DRIVERS = {
  VER: { name: "Verstappen", color: "#3671C6", team: "Red Bull" },
  LEC: { name: "Leclerc",    color: "#E8002D", team: "Ferrari" },
  NOR: { name: "Norris",     color: "#FF8000", team: "McLaren" },
  HAM: { name: "Hamilton",   color: "#27F4D2", team: "Mercedes" },
  PIA: { name: "Piastri",    color: "#FF8000", team: "McLaren" },
  SAI: { name: "Sainz",      color: "#E8002D", team: "Ferrari" },
  RUS: { name: "Russell",    color: "#27F4D2", team: "Mercedes" },
  ALO: { name: "Alonso",     color: "#358C75", team: "Aston Martin" },
};

const RACES = ["Bahrain","Saudi Arabia","Australia","Japan","Monaco","Silverstone","Monza","Singapore","Abu Dhabi"];
const SESSIONS = ["Q","R","FP1","FP2","FP3"];
const SESSION_LABELS = { Q:"Qualifying", R:"Race", FP1:"Practice 1", FP2:"Practice 2", FP3:"Practice 3" };

// Generate a telemetry lap curve for a given "performance" offset
function generateTelemetry(offset = 0) {
  const points = 300;
  const data = [];
  // Simulate a circuit with straights, braking, corners
  // Using a combination of sine waves to mimic realistic speed trace shape
  for (let i = 0; i < points; i++) {
    const t = i / points;
    const dist = t * 5200;
    // Speed profile: base + circuit-shaped variation
    const speedBase =
      220 +
      60 * Math.sin(t * Math.PI * 2) +
      40 * Math.sin(t * Math.PI * 6 + 1) -
      30 * Math.abs(Math.sin(t * Math.PI * 4 + 0.5)) +
      offset * 8 * Math.sin(t * Math.PI * 3);

    const speed = Math.max(80, Math.min(330, speedBase + (Math.random() - 0.5) * 5));
    const throttle = speed > 180 ? Math.min(100, (speed - 80) / 2.5 + Math.random() * 5) : Math.random() * 30;
    const brake = speed < 150 && Math.sin(t * Math.PI * 4) < -0.3 ? 1 : 0;
    const gear = Math.max(1, Math.min(8, Math.round(speed / 45)));
    // Lap time accumulation (simulated)
    const lapTime = t * (90.5 - offset * 0.3) + (Math.random() - 0.5) * 0.02;

    data.push({ dist, speed, throttle, brake, gear, lapTime });
  }
  return data;
}

function generateTyreDeg(compound, startLap, laps, baseTime, degradation) {
  return Array.from({ length: laps }, (_, i) => ({
    tyreLife: i + 1,
    lapNum: startLap + i,
    lapTime: baseTime + i * degradation + (Math.random() - 0.5) * 0.15,
    compound,
  }));
}

function generateWeather() {
  return Array.from({ length: 60 }, (_, i) => ({
    min: i,
    trackTemp: 42 + 3 * Math.sin(i / 10) + (Math.random() - 0.5),
    airTemp: 28 + 2 * Math.sin(i / 15) + (Math.random() - 0.5),
    humidity: 55 + 5 * Math.cos(i / 12),
  }));
}

function generateTrackMap() {
  // Approximate Bahrain circuit shape using parametric curve
  const pts = [];
  for (let i = 0; i < 300; i++) {
    const t = (i / 300) * 2 * Math.PI;
    const x = 200 * Math.cos(t) + 80 * Math.cos(3 * t) + 20 * Math.cos(5 * t);
    const y = 180 * Math.sin(t) - 60 * Math.sin(2 * t) + 15 * Math.sin(4 * t);
    pts.push({ x: x + 300, y: y + 220 });
  }
  return pts;
}

// ── SVG CHART HELPERS ──────────────────────────────────────────────────────
function linePoints(data, xKey, yKey, width, height, xMin, xMax, yMin, yMax) {
  return data.map(d => {
    const px = ((d[xKey] - xMin) / (xMax - xMin)) * width;
    const py = height - ((d[yKey] - yMin) / (yMax - yMin)) * height;
    return `${px},${py}`;
  }).join(" ");
}

function MiniChart({ data, color, height = 60, yKey = "speed", label }) {
  const w = 340, h = height;
  const vals = data.map(d => d[yKey]);
  const yMin = Math.min(...vals), yMax = Math.max(...vals);
  const pts = linePoints(data, "dist", yKey, w, h, 0, 5200, yMin, yMax);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display:"block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────
export default function PitWallDashboard() {
  const [d1Key, setD1Key] = useState("VER");
  const [d2Key, setD2Key] = useState("LEC");
  const [race, setRace] = useState("Bahrain");
  const [session, setSession] = useState("Q");
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("telemetry");
  const [hoveredDist, setHoveredDist] = useState(null);
  const [scanline, setScanline] = useState(0);
  const telRef = useRef(null);

  // Animate scanline on load
  useEffect(() => {
    if (!loaded) return;
    let frame;
    let start = null;
    const animate = (ts) => {
      if (!start) start = ts;
      setScanline(((ts - start) / 30) % 100);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [loaded]);

  const d1 = DRIVERS[d1Key];
  const d2 = DRIVERS[d2Key];
  const tel1 = generateTelemetry(0.4);
  const tel2 = generateTelemetry(-0.2);
  const weather = generateWeather();
  const trackMap = generateTrackMap();

  // Tyre deg — D1 on Soft 20 laps, D2 on Medium 25 laps
  const deg1 = generateTyreDeg("SOFT", 1, 20, 92.1, 0.085);
  const deg2 = generateTyreDeg("MEDIUM", 1, 25, 92.8, 0.055);

  const t1Str = "1:29.817";
  const t2Str = "1:30.154";
  const gap = "+0.337";

  function handleLoad() {
    if (d1Key === d2Key) return;
    setLoading(true);
    setTimeout(() => { setLoading(false); setLoaded(true); }, 1400);
  }

  // Telemetry SVG interaction
  function handleTelHover(e) {
    if (!telRef.current) return;
    const rect = telRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const pct = px / rect.width;
    setHoveredDist(Math.round(pct * 5200));
  }

  const hoverIdx = hoveredDist !== null ? Math.round((hoveredDist / 5200) * 299) : null;

  // ── RENDER ──────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: "#05050a",
      minHeight: "100vh",
      fontFamily: "'Rajdhani', 'Barlow Condensed', 'Arial Narrow', sans-serif",
      color: "#ddd",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Google font import */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; background: #0a0a0f; }
        ::-webkit-scrollbar-thumb { background: #1e1e2e; }
        select { appearance: none; cursor: pointer; }
        select option { background: #0f0f1a; }

        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes scanIn { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes loadBar { from{width:0} to{width:100%} }

        .fade-up { animation: fadeUp 0.5s ease both; }
        .fade-up-1 { animation: fadeUp 0.5s 0.05s ease both; }
        .fade-up-2 { animation: fadeUp 0.5s 0.1s ease both; }
        .fade-up-3 { animation: fadeUp 0.5s 0.15s ease both; }
        .fade-up-4 { animation: fadeUp 0.5s 0.2s ease both; }
        .fade-up-5 { animation: fadeUp 0.5s 0.25s ease both; }

        .tab-btn {
          background: none; border: none; color: #555; cursor: pointer;
          font-family: inherit; font-size: 13px; font-weight: 700;
          letter-spacing: 1.5px; padding: 8px 18px; text-transform: uppercase;
          border-bottom: 2px solid transparent; transition: all 0.2s;
        }
        .tab-btn:hover { color: #aaa; }
        .tab-btn.active { color: #fff; border-bottom-color: #e8002d; }

        .ctrl-select {
          background: #0d0d16; border: 1px solid #1e1e2e; color: #ccc;
          font-family: inherit; font-size: 13px; font-weight: 600;
          padding: 7px 28px 7px 10px; border-radius: 3px; width: 100%;
          letter-spacing: 0.5px;
        }
        .ctrl-select:focus { outline: none; border-color: #e8002d44; }

        .load-btn {
          background: #e8002d; border: none; color: #fff; cursor: pointer;
          font-family: inherit; font-size: 14px; font-weight: 700;
          letter-spacing: 2px; padding: 11px 0; width: 100%;
          border-radius: 3px; text-transform: uppercase;
          transition: background 0.2s, transform 0.1s;
          position: relative; overflow: hidden;
        }
        .load-btn:hover { background: #ff1a3e; }
        .load-btn:active { transform: scale(0.98); }
        .load-btn:disabled { background: #3a0010; color: #660020; cursor: not-allowed; }

        .metric-card {
          background: #0a0a12; border: 1px solid #1a1a28;
          border-radius: 4px; padding: 12px 14px;
          transition: border-color 0.2s;
        }
        .metric-card:hover { border-color: #2a2a3e; }

        .channel-label {
          font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
          color: #444; font-weight: 700; margin-bottom: 4px;
        }
      `}</style>

      {/* Background grid */}
      <div style={{
        position:"fixed", inset:0, pointerEvents:"none", zIndex:0,
        backgroundImage: "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }} />

      {/* Top bar */}
      <div style={{
        position:"sticky", top:0, zIndex:100,
        background: "rgba(5,5,10,0.95)", backdropFilter:"blur(12px)",
        borderBottom: "1px solid #1a1a28",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"0 24px", height:52,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          {/* F1 logo-style mark */}
          <div style={{
            background:"#e8002d", color:"#fff", fontWeight:900,
            fontSize:13, letterSpacing:2, padding:"4px 9px", borderRadius:2,
          }}>F1</div>
          <span style={{ fontWeight:700, fontSize:15, letterSpacing:3, color:"#fff", textTransform:"uppercase" }}>
            Pit Wall
          </span>
          <span style={{ fontSize:11, color:"#444", letterSpacing:1 }}>TELEMETRY DASHBOARD</span>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {loaded && (
            <>
              <div style={{ width:6, height:6, borderRadius:"50%", background:"#00ff88", animation:"pulse 2s infinite" }} />
              <span style={{ fontSize:11, color:"#00ff88", letterSpacing:1.5 }}>LIVE DATA</span>
            </>
          )}
          <span style={{ fontSize:11, color:"#333", marginLeft:12 }}>2024 SEASON</span>
        </div>
      </div>

      <div style={{ display:"flex", minHeight:"calc(100vh - 52px)" }}>

        {/* ── SIDEBAR ── */}
        <div style={{
          width:220, flexShrink:0,
          background:"#070710", borderRight:"1px solid #12121e",
          padding:"20px 16px", display:"flex", flexDirection:"column", gap:20,
        }}>
          <div>
            <div className="channel-label" style={{ marginBottom:8 }}>Grand Prix</div>
            <select className="ctrl-select" value={race} onChange={e=>setRace(e.target.value)}>
              {RACES.map(r=><option key={r}>{r}</option>)}
            </select>
          </div>

          <div>
            <div className="channel-label" style={{ marginBottom:8 }}>Session</div>
            <select className="ctrl-select" value={session} onChange={e=>setSession(e.target.value)}>
              {SESSIONS.map(s=><option key={s} value={s}>{SESSION_LABELS[s]}</option>)}
            </select>
          </div>

          <div style={{ borderTop:"1px solid #12121e", paddingTop:20 }}>
            <div className="channel-label" style={{ marginBottom:8 }}>Driver 1</div>
            <select className="ctrl-select" value={d1Key} onChange={e=>setD1Key(e.target.value)}
              style={{ borderLeft:`3px solid ${d1.color}` }}>
              {Object.entries(DRIVERS).map(([k,v])=><option key={k} value={k}>{k} — {v.name}</option>)}
            </select>
          </div>

          <div>
            <div className="channel-label" style={{ marginBottom:8 }}>Driver 2</div>
            <select className="ctrl-select" value={d2Key} onChange={e=>setD2Key(e.target.value)}
              style={{ borderLeft:`3px solid ${d2.color}` }}>
              {Object.entries(DRIVERS).map(([k,v])=><option key={k} value={k}>{k} — {v.name}</option>)}
            </select>
          </div>

          {d1Key === d2Key && (
            <div style={{ fontSize:11, color:"#e8002d", letterSpacing:0.5 }}>
              ⚠ Select different drivers
            </div>
          )}

          <button className="load-btn" onClick={handleLoad} disabled={loading || d1Key===d2Key}>
            {loading ? "LOADING..." : "▶  LOAD SESSION"}
          </button>

          {loading && (
            <div style={{ height:2, background:"#1a1a28", borderRadius:1, overflow:"hidden" }}>
              <div style={{ height:"100%", background:"#e8002d", animation:"loadBar 1.4s linear both" }} />
            </div>
          )}

          {/* Driver legend */}
          {loaded && (
            <div style={{ marginTop:"auto", display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ borderTop:"1px solid #12121e", paddingTop:16 }}>
                {[{k:d1Key,d:d1},{k:d2Key,d:d2}].map(({k,d})=>(
                  <div key={k} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                    <div style={{ width:3, height:36, background:d.color, borderRadius:2, flexShrink:0 }} />
                    <div>
                      <div style={{ fontSize:18, fontWeight:700, color:"#fff", letterSpacing:1 }}>{k}</div>
                      <div style={{ fontSize:10, color:"#555", letterSpacing:1 }}>{d.team.toUpperCase()}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:10, color:"#333", lineHeight:1.6 }}>
                Data via FastF1<br/>Official F1 timing feed
              </div>
            </div>
          )}
        </div>

        {/* ── MAIN CONTENT ── */}
        <div style={{ flex:1, overflow:"auto", padding:"20px 24px" }}>

          {!loaded && !loading && (
            <div style={{
              display:"flex", flexDirection:"column", alignItems:"center",
              justifyContent:"center", height:"60vh", gap:20, color:"#2a2a3a",
            }}>
              <div style={{ fontSize:72, opacity:0.3 }}>🏎️</div>
              <div style={{ fontSize:20, fontWeight:700, letterSpacing:3, textTransform:"uppercase" }}>
                Select Race &amp; Drivers
              </div>
              <div style={{ fontSize:13, color:"#222", letterSpacing:1 }}>
                Configure the sidebar and click LOAD SESSION
              </div>
            </div>
          )}

          {loaded && (
            <>
              {/* Header */}
              <div className="fade-up" style={{ marginBottom:20 }}>
                <div style={{ fontSize:11, color:"#e8002d", letterSpacing:3, textTransform:"uppercase", marginBottom:4 }}>
                  2024 Formula 1 World Championship
                </div>
                <h1 style={{
                  fontSize:28, fontWeight:900, letterSpacing:4,
                  textTransform:"uppercase", color:"#fff", margin:0,
                  fontFamily:"'Rajdhani',sans-serif",
                }}>
                  {race} Grand Prix
                  <span style={{ fontSize:14, color:"#555", marginLeft:14, letterSpacing:2, fontWeight:500 }}>
                    — {SESSION_LABELS[session]}
                  </span>
                </h1>
              </div>

              {/* Summary cards */}
              <div className="fade-up-1" style={{
                display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, marginBottom:24,
              }}>
                {[
                  { label:`${d1Key} Fastest Lap`, value:t1Str, sub:d1.team, accent:d1.color },
                  { label:`${d2Key} Fastest Lap`, value:t2Str, sub:d2.team, accent:d2.color },
                  { label:"Gap", value:gap, sub:"to fastest", accent:"#888" },
                  { label:"Track Temp", value:"44.2°C", sub:"Air: 29.1°C", accent:"#ff8800" },
                  { label:"Conditions", value:"DRY", sub:"Humidity 52%", accent:"#00bbff" },
                ].map((m,i)=>(
                  <div key={i} className="metric-card" style={{ borderTop:`2px solid ${m.accent}` }}>
                    <div style={{ fontSize:10, color:"#444", letterSpacing:2, textTransform:"uppercase", marginBottom:6 }}>{m.label}</div>
                    <div style={{ fontSize:22, fontWeight:700, color:"#fff", fontFamily:"'Share Tech Mono', monospace", letterSpacing:1 }}>{m.value}</div>
                    <div style={{ fontSize:10, color:"#555", marginTop:4, letterSpacing:1 }}>{m.sub}</div>
                  </div>
                ))}
              </div>

              {/* Tabs */}
              <div className="fade-up-2" style={{ borderBottom:"1px solid #12121e", marginBottom:20, display:"flex" }}>
                {[
                  {id:"telemetry", label:"Telemetry"},
                  {id:"delta", label:"Lap Delta"},
                  {id:"tyres", label:"Tyre Degradation"},
                  {id:"trackmap", label:"Track Map"},
                  {id:"weather", label:"Weather"},
                ].map(t=>(
                  <button key={t.id} className={`tab-btn ${activeTab===t.id?"active":""}`}
                    onClick={()=>setActiveTab(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ── TAB: TELEMETRY ── */}
              {activeTab==="telemetry" && (
                <div className="fade-up-3">
                  <div style={{ fontSize:11, color:"#444", letterSpacing:2, marginBottom:14 }}>
                    FASTEST LAP COMPARISON — ALIGNED BY DISTANCE
                    {hoverIdx !== null && (
                      <span style={{ marginLeft:20, color:"#888" }}>
                        @ {hoveredDist}m  |  {d1Key}: <span style={{color:d1.color}}>{Math.round(tel1[Math.min(hoverIdx,299)]?.speed)} km/h</span>
                        {"  "}|  {d2Key}: <span style={{color:d2.color}}>{Math.round(tel2[Math.min(hoverIdx,299)]?.speed)} km/h</span>
                      </span>
                    )}
                  </div>

                  {/* 4-channel SVG chart */}
                  <div
                    ref={telRef}
                    onMouseMove={handleTelHover}
                    onMouseLeave={()=>setHoveredDist(null)}
                    style={{
                      background:"#080812", border:"1px solid #14141e",
                      borderRadius:4, padding:"16px 16px 8px", cursor:"crosshair",
                      position:"relative", overflow:"hidden",
                    }}
                  >
                    {/* Hover line */}
                    {hoverIdx !== null && (
                      <div style={{
                        position:"absolute", top:0, bottom:0,
                        left:`calc(${(hoveredDist/5200)*100}% + 0px)`,
                        width:1, background:"rgba(255,255,255,0.15)",
                        pointerEvents:"none", zIndex:10,
                      }} />
                    )}

                    {[
                      { key:"speed",    label:"SPEED (km/h)",  yMin:80,  yMax:330  },
                      { key:"throttle", label:"THROTTLE (%)",  yMin:0,   yMax:100  },
                      { key:"brake",    label:"BRAKE",         yMin:0,   yMax:1    },
                      { key:"gear",     label:"GEAR",          yMin:1,   yMax:8    },
                    ].map((ch, ci) => {
                      const h = ch.key==="speed" ? 100 : ch.key==="throttle" ? 60 : 40;
                      const w = 800;
                      const pts1 = linePoints(tel1,"dist",ch.key,w,h,0,5200,ch.yMin,ch.yMax);
                      const pts2 = linePoints(tel2,"dist",ch.key,w,h,0,5200,ch.yMin,ch.yMax);
                      return (
                        <div key={ch.key} style={{ marginBottom: ci<3?12:0 }}>
                          <div className="channel-label">{ch.label}</div>
                          <svg width="100%" viewBox={`0 0 ${w} ${h}`}
                            style={{ display:"block", background:"rgba(255,255,255,0.01)", borderRadius:2 }}>
                            {/* Grid lines */}
                            {[0.25,0.5,0.75].map(f=>(
                              <line key={f} x1="0" y1={h*f} x2={w} y2={h*f}
                                stroke="#1a1a2a" strokeWidth="0.5" />
                            ))}
                            <polyline points={pts1} fill="none" stroke={d1.color} strokeWidth="1.6"
                              strokeLinejoin="round" opacity="0.9" />
                            <polyline points={pts2} fill="none" stroke={d2.color} strokeWidth="1.6"
                              strokeLinejoin="round" opacity="0.75" strokeDasharray="4 2" />
                          </svg>
                        </div>
                      );
                    })}

                    {/* X axis labels */}
                    <div style={{ display:"flex", justifyContent:"space-between", marginTop:6 }}>
                      {[0,1000,2000,3000,4000,5000].map(d=>(
                        <span key={d} style={{ fontSize:9, color:"#333", letterSpacing:1 }}>{d}m</span>
                      ))}
                    </div>

                    {/* Legend */}
                    <div style={{ display:"flex", gap:20, marginTop:10 }}>
                      {[{k:d1Key,d:d1,dash:false},{k:d2Key,d:d2,dash:true}].map(({k,d,dash})=>(
                        <div key={k} style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5"
                            stroke={d.color} strokeWidth="2"
                            strokeDasharray={dash?"5 2":"none"} /></svg>
                          <span style={{ fontSize:11, color:d.color, fontWeight:700, letterSpacing:1 }}>{k}</span>
                          <span style={{ fontSize:10, color:"#444" }}>{d.team}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB: DELTA ── */}
              {activeTab==="delta" && (
                <div className="fade-up-3">
                  <div style={{ fontSize:11, color:"#444", letterSpacing:2, marginBottom:14 }}>
                    CUMULATIVE LAP TIME DELTA — POSITIVE = {d1Key} LOSING TIME
                  </div>
                  <div style={{
                    background:"#080812", border:"1px solid #14141e",
                    borderRadius:4, padding:"16px 16px 8px",
                  }}>
                    {(() => {
                      const w = 800, h = 120;
                      // Compute delta
                      const delta = tel1.map((p,i) => ({
                        dist: p.dist,
                        val: (p.lapTime - tel2[i].lapTime) * 0.5,
                      }));
                      const dMin = Math.min(...delta.map(d=>d.val));
                      const dMax = Math.max(...delta.map(d=>d.val));
                      const pad = 0.1;
                      const yMin = dMin - pad, yMax = dMax + pad;
                      const pts = linePoints(delta,"dist","val",w,h,0,5200,yMin,yMax);
                      // Zero line
                      const zeroY = h - ((0-yMin)/(yMax-yMin))*h;

                      // Build fill paths for above/below zero
                      const abovePts = delta.map(d => ({
                        ...d, val: Math.max(0, d.val)
                      }));
                      const belowPts = delta.map(d => ({
                        ...d, val: Math.min(0, d.val)
                      }));

                      const toPath = (pts, clampY) => {
                        const xs = pts.map(d => ((d.dist/5200)*w).toFixed(1));
                        const ys = pts.map(d => (h - ((d.val-yMin)/(yMax-yMin))*h).toFixed(1));
                        return `M ${xs[0]},${zeroY.toFixed(1)} ` +
                          xs.map((x,i)=>`L ${x},${ys[i]}`).join(" ") +
                          ` L ${xs[xs.length-1]},${zeroY.toFixed(1)} Z`;
                      };

                      return (
                        <>
                          <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display:"block" }}>
                            <line x1="0" y1={zeroY} x2={w} y2={zeroY} stroke="#2a2a3a" strokeWidth="1" />
                            <path d={toPath(abovePts)} fill={`${d2.color}33`} />
                            <path d={toPath(belowPts)} fill={`${d1.color}33`} />
                            <polyline points={pts} fill="none" stroke="#fff" strokeWidth="1.5"
                              strokeLinejoin="round" />
                            {[0.25,0.5,0.75].map(f=>(
                              <line key={f} x1={w*f} y1="0" x2={w*f} y2={h}
                                stroke="#12121e" strokeWidth="0.5" />
                            ))}
                          </svg>
                          <div style={{ display:"flex", justifyContent:"space-between", marginTop:6 }}>
                            {[0,1000,2000,3000,4000,5000].map(d=>(
                              <span key={d} style={{ fontSize:9, color:"#333" }}>{d}m</span>
                            ))}
                          </div>
                          <div style={{ display:"flex", gap:20, marginTop:12 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                              <div style={{ width:12, height:12, background:`${d1.color}55`, border:`1px solid ${d1.color}` }} />
                              <span style={{ fontSize:11, color:d1.color }}>{d1Key} faster</span>
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                              <div style={{ width:12, height:12, background:`${d2.color}55`, border:`1px solid ${d2.color}` }} />
                              <span style={{ fontSize:11, color:d2.color }}>{d2Key} faster</span>
                            </div>
                            <span style={{ fontSize:11, color:"#555", marginLeft:"auto" }}>
                              Final Δ: <span style={{ color:"#fff", fontFamily:"monospace" }}>{gap}</span>
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* ── TAB: TYRES ── */}
              {activeTab==="tyres" && (
                <div className="fade-up-3">
                  <div style={{ fontSize:11, color:"#444", letterSpacing:2, marginBottom:14 }}>
                    TYRE DEGRADATION — LAP TIME vs TYRE AGE (RACE SESSION)
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"3fr 1fr", gap:16 }}>
                    <div style={{
                      background:"#080812", border:"1px solid #14141e",
                      borderRadius:4, padding:"16px",
                    }}>
                      {(() => {
                        const w = 600, h = 220;
                        const allTimes = [...deg1, ...deg2].map(d=>d.lapTime);
                        const tMax = Math.max(...allTimes) + 0.5;
                        const tMin = Math.min(...allTimes) - 0.5;
                        const lifeMax = 26;

                        const toXY = (d) => ({
                          x: (d.tyreLife / lifeMax) * w,
                          y: h - ((d.lapTime - tMin)/(tMax - tMin)) * h,
                        });

                        // Trend line for deg1
                        const z1 = (() => {
                          const n = deg1.length;
                          const sx = deg1.reduce((a,d)=>a+d.tyreLife,0);
                          const sy = deg1.reduce((a,d)=>a+d.lapTime,0);
                          const sxy = deg1.reduce((a,d)=>a+d.tyreLife*d.lapTime,0);
                          const sx2 = deg1.reduce((a,d)=>a+d.tyreLife*d.tyreLife,0);
                          const m = (n*sxy - sx*sy)/(n*sx2 - sx*sx);
                          const b = (sy - m*sx)/n;
                          return {m, b};
                        })();

                        return (
                          <svg width="100%" viewBox={`0 0 ${w} ${h+30}`} style={{ display:"block" }}>
                            {/* Grid */}
                            {[0.25,0.5,0.75,1].map(f=>(
                              <line key={f} x1="0" y1={h*f} x2={w} y2={h*f}
                                stroke="#12121e" strokeWidth="0.5" />
                            ))}
                            {[5,10,15,20,25].map(v=>(
                              <g key={v}>
                                <line x1={(v/lifeMax)*w} y1="0" x2={(v/lifeMax)*w} y2={h}
                                  stroke="#12121e" strokeWidth="0.5" />
                                <text x={(v/lifeMax)*w} y={h+18}
                                  fill="#333" fontSize="9" textAnchor="middle"
                                  fontFamily="Rajdhani,sans-serif">
                                  Lap {v}
                                </text>
                              </g>
                            ))}

                            {/* D1 scatter (SOFT) */}
                            {deg1.map((d,i)=>{
                              const {x,y} = toXY(d);
                              return <circle key={i} cx={x} cy={y} r="3.5"
                                fill={d1.color} opacity="0.75" />;
                            })}

                            {/* D1 trend */}
                            <line
                              x1={0} y1={h-((z1.b-tMin)/(tMax-tMin))*h}
                              x2={w} y2={h-((z1.m*lifeMax+z1.b-tMin)/(tMax-tMin))*h}
                              stroke={d1.color} strokeWidth="1.5" strokeDasharray="6 3" opacity="0.6"
                            />

                            {/* D2 scatter (MEDIUM) */}
                            {deg2.map((d,i)=>{
                              const {x,y} = toXY(d);
                              return <polygon key={i}
                                points={`${x},${y-4} ${x+4},${y+3} ${x-4},${y+3}`}
                                fill={d2.color} opacity="0.75" />;
                            })}

                            {/* Axis labels */}
                            <text x="0" y={h+28} fill="#333" fontSize="9" fontFamily="Rajdhani,sans-serif">0</text>
                          </svg>
                        );
                      })()}
                    </div>

                    {/* Stats panel */}
                    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      {[
                        { driver:d1Key, color:d1.color, compound:"SOFT",   deg:"85 ms/lap",  laps:20 },
                        { driver:d2Key, color:d2.color, compound:"MEDIUM", deg:"55 ms/lap",  laps:25 },
                      ].map(s=>(
                        <div key={s.driver} className="metric-card" style={{ borderTop:`2px solid ${s.color}` }}>
                          <div style={{ fontSize:14, fontWeight:700, color:s.color, letterSpacing:2 }}>{s.driver}</div>
                          <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:8 }}>
                            <div>
                              <div style={{ fontSize:9, color:"#444", letterSpacing:1 }}>COMPOUND</div>
                              <div style={{ fontSize:16, fontWeight:700, color:"#fff" }}>{s.compound}</div>
                            </div>
                            <div>
                              <div style={{ fontSize:9, color:"#444", letterSpacing:1 }}>DEG RATE</div>
                              <div style={{ fontSize:16, fontWeight:700, color:"#ff8800", fontFamily:"monospace" }}>{s.deg}</div>
                            </div>
                            <div>
                              <div style={{ fontSize:9, color:"#444", letterSpacing:1 }}>STINT LENGTH</div>
                              <div style={{ fontSize:16, fontWeight:700, color:"#fff" }}>{s.laps} laps</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB: TRACK MAP ── */}
              {activeTab==="trackmap" && (
                <div className="fade-up-3">
                  <div style={{ fontSize:11, color:"#444", letterSpacing:2, marginBottom:14 }}>
                    TRACK SPEED MAP — {d1Key} FASTEST LAP — COLOUR = SPEED
                  </div>
                  <div style={{
                    background:"#080812", border:"1px solid #14141e",
                    borderRadius:4, padding:"16px",
                    display:"flex", justifyContent:"center",
                  }}>
                    {(() => {
                      const mapPts = generateTrackMap();
                      const speedMin = 80, speedMax = 330;
                      // Sample speed at each track point
                      const speeds = mapPts.map((_,i) => tel1[Math.floor(i * tel1.length / mapPts.length)]?.speed || 200);

                      // Color scale: slow=red, mid=yellow, fast=green
                      const speedToColor = (s) => {
                        const t = (s - speedMin) / (speedMax - speedMin);
                        if (t < 0.5) {
                          const r = 232, g = Math.round(t*2*220), b = 45;
                          return `rgb(${r},${g},${b})`;
                        } else {
                          const r = Math.round((1-(t-0.5)*2)*220), g = 200, b = 45;
                          return `rgb(${r},${g},${b})`;
                        }
                      };

                      return (
                        <svg width="100%" viewBox="0 0 600 440" style={{ maxWidth:560 }}>
                          {/* Draw track as coloured segments */}
                          {mapPts.map((pt, i) => {
                            if (i === 0) return null;
                            const prev = mapPts[i-1];
                            return (
                              <line key={i}
                                x1={prev.x} y1={prev.y}
                                x2={pt.x} y2={pt.y}
                                stroke={speedToColor(speeds[i])}
                                strokeWidth="5"
                                strokeLinecap="round"
                              />
                            );
                          })}
                          {/* Start/finish mark */}
                          <circle cx={mapPts[0].x} cy={mapPts[0].y} r="6"
                            fill="#fff" stroke="#e8002d" strokeWidth="2" />
                          <text x={mapPts[0].x+10} y={mapPts[0].y+4}
                            fill="#888" fontSize="10" fontFamily="Rajdhani,sans-serif">S/F</text>

                          {/* Colour legend */}
                          <defs>
                            <linearGradient id="speedGrad" x1="0" x2="1" y1="0" y2="0">
                              <stop offset="0%" stopColor="rgb(232,0,45)" />
                              <stop offset="50%" stopColor="rgb(232,220,45)" />
                              <stop offset="100%" stopColor="rgb(0,200,45)" />
                            </linearGradient>
                          </defs>
                          <rect x="20" y="400" width="150" height="8" fill="url(#speedGrad)" rx="3" />
                          <text x="20" y="422" fill="#444" fontSize="9" fontFamily="Rajdhani,sans-serif">80 km/h</text>
                          <text x="145" y="422" fill="#444" fontSize="9" fontFamily="Rajdhani,sans-serif">330 km/h</text>
                        </svg>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* ── TAB: WEATHER ── */}
              {activeTab==="weather" && (
                <div className="fade-up-3">
                  <div style={{ fontSize:11, color:"#444", letterSpacing:2, marginBottom:14 }}>
                    SESSION WEATHER DATA
                  </div>

                  {/* Summary row */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
                    {[
                      { label:"Track Temp", value:"44.2°C", delta:"peak 47.1°C", color:"#e8002d" },
                      { label:"Air Temp",   value:"29.1°C", delta:"humidity 52%", color:"#4fc3f7" },
                      { label:"Wind",       value:"12 km/h", delta:"NE direction", color:"#aaa" },
                      { label:"Rainfall",   value:"DRY", delta:"0.0 mm", color:"#00cc88" },
                    ].map((m,i)=>(
                      <div key={i} className="metric-card" style={{ borderTop:`2px solid ${m.color}` }}>
                        <div style={{ fontSize:9, color:"#444", letterSpacing:2, marginBottom:6 }}>{m.label}</div>
                        <div style={{ fontSize:24, fontWeight:700, color:"#fff", fontFamily:"monospace" }}>{m.value}</div>
                        <div style={{ fontSize:10, color:"#555", marginTop:4 }}>{m.delta}</div>
                      </div>
                    ))}
                  </div>

                  {/* Temperature time chart */}
                  <div style={{
                    background:"#080812", border:"1px solid #14141e",
                    borderRadius:4, padding:"16px",
                  }}>
                    <div className="channel-label" style={{ marginBottom:10 }}>TEMPERATURE OVER SESSION</div>
                    {(() => {
                      const w = 700, h = 160;
                      const tMin = 25, tMax = 50;
                      const trackPts = linePoints(weather, "min", "trackTemp", w, h, 0, 59, tMin, tMax);
                      const airPts   = linePoints(weather, "min", "airTemp",   w, h, 0, 59, tMin, tMax);
                      return (
                        <svg width="100%" viewBox={`0 0 ${w} ${h+20}`} style={{ display:"block" }}>
                          {[25,30,35,40,45,50].map(t=>{
                            const y = h - ((t-tMin)/(tMax-tMin))*h;
                            return (
                              <g key={t}>
                                <line x1="0" y1={y} x2={w} y2={y} stroke="#12121e" strokeWidth="0.5" />
                                <text x="2" y={y-2} fill="#333" fontSize="8" fontFamily="Rajdhani,sans-serif">{t}°</text>
                              </g>
                            );
                          })}
                          {/* Filled area for track temp */}
                          <polyline points={trackPts} fill="none" stroke="#e8002d" strokeWidth="2" strokeLinejoin="round" />
                          <polyline points={airPts}   fill="none" stroke="#4fc3f7" strokeWidth="2" strokeLinejoin="round" />
                          {[0,15,30,45,59].map(m=>(
                            <text key={m} x={(m/59)*w} y={h+16} fill="#333" fontSize="9"
                              textAnchor="middle" fontFamily="Rajdhani,sans-serif">
                              T+{m}min
                            </text>
                          ))}
                        </svg>
                      );
                    })()}
                    <div style={{ display:"flex", gap:20, marginTop:8 }}>
                      {[{c:"#e8002d",l:"Track Temp"},{c:"#4fc3f7",l:"Air Temp"}].map(({c,l})=>(
                        <div key={l} style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <div style={{ width:20, height:2, background:c }} />
                          <span style={{ fontSize:11, color:c }}>{l}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
