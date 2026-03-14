"use client";
import { useState, useRef, useCallback } from "react";

function toBase64(file, maxPx = 1400) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onerror = () => rej(new Error("読み込み失敗: " + file.name));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => rej(new Error("デコード失敗: " + file.name));
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxPx || h > maxPx) {
          const r = Math.min(maxPx / w, maxPx / h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const url = canvas.toDataURL("image/jpeg", 0.88);
        res({ base64: url.split(",")[1], url, name: file.name });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

const C = {
  acc: "#4fffb0", acc2: "#00c8ff", warn: "#ffdd57", danger: "#ff6b6b",
  surf: "#111827", surf2: "#1a2234", dim: "#7a8ba0",
  bdr: "1px solid rgba(255,255,255,0.07)",
};

const IMP = {
  high:   { label: "重要度高", bg: "#3d1a1a", color: "#ff6b6b", dot: "#ff6b6b" },
  medium: { label: "重要度中", bg: "#2d2a10", color: "#ffdd57", dot: "#ffdd57" },
  low:    { label: "重要度低", bg: "#0d2820", color: "#4fffb0", dot: "#4fffb0" },
};

export default function MedCard() {
  const [images,    setImages]    = useState([]);
  const [mode,      setMode]      = useState("ai");
  const [count,     setCount]     = useState(10);
  const [phase,     setPhase]     = useState("input");
  const [cards,     setCards]     = useState([]);
  const [errMsg,    setErrMsg]    = useState("");
  const [drag,      setDrag]      = useState(false);
  const [loadTitle, setLoadTitle] = useState("");
  const [loadSub,   setLoadSub]   = useState("");
  const [progress,  setProgress]  = useState(0);
  const [logs,      setLogs]      = useState([]);
  const [doneSet,   setDoneSet]   = useState(new Set());
  const [idx,       setIdx]       = useState(0);
  const [flipped,   setFlipped]   = useState(false);
  const [known,     setKnown]     = useState(new Set());
  const [retry,     setRetry]     = useState(new Set());
  const [testIdx,   setTestIdx]   = useState(0);
  const [answer,    setAnswer]    = useState("");
  const [checked,   setChecked]   = useState(false);
  const [score,     setScore]     = useState({ ok: 0, ng: 0 });
  const [testDone,  setTestDone]  = useState(false);

  const fileRef  = useRef();
  const fileRef2 = useRef();
  const logRef   = useRef();

  const addLog = useCallback((msg, type = "info") => {
    const t = new Date().toTimeString().slice(0, 8);
    setLogs(p => [...p, { t, msg, type }]);
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = 9999; }, 30);
  }, []);

  const addFiles = async (files) => {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      try {
        const img = await toBase64(f);
        setImages(p => [...p, img]);
      } catch (e) { alert("⚠ " + e.message); }
    }
  };

  const generate = async () => {
    if (!images.length) return;
    setPhase("loading");
    setLogs([]);
    setProgress(0);
    setDoneSet(new Set());

    try {
      const texts = [];

      for (let i = 0; i < images.length; i++) {
        setLoadTitle(`画像 ${i + 1} / ${images.length} を解析中...`);
        setLoadSub("Gemini AIがテキストを読み取っています");
        setProgress(Math.round((i / images.length) * 65));
        addLog(`画像 ${i + 1}/${images.length}「${images[i].name}」を送信中...`);

        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: images[i].base64,
            mimeType: "image/jpeg",
            mode,
            count,
            ocrOnly: true,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || "OCR失敗");

        addLog(`画像 ${i + 1} 完了 — ${data.text?.length ?? 0}文字`, "ok");
        texts.push(data.text || "");
        setDoneSet(p => new Set([...p, i]));
      }

      setProgress(80);
      setLoadTitle("カードを生成中...");
      setLoadSub("重要箇所を選んでカードを作成しています");
      addLog("全画像の読み取り完了。カード生成開始...");

      const combined = texts.length === 1
        ? texts[0]
        : texts.map((t, i) => `【画像${i + 1}】\n${t}`).join("\n\n");

      const res2 = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: combined, mode, count, ocrOnly: false }),
      });
      const data2 = await res2.json();
      if (!res2.ok || data2.error) throw new Error(data2.error || "カード生成失敗");
      if (!data2.cards?.length) throw new Error("カードが生成されませんでした");

      setProgress(100);
      addLog(`✓ ${data2.cards.length}枚のカードを生成`, "ok");
      setLoadTitle("完了！");
      setLoadSub(`${data2.cards.length}枚のカードを生成しました 🎉`);

      setCards(data2.cards);
      setIdx(0); setFlipped(false); setKnown(new Set()); setRetry(new Set());
      setTestIdx(0); setAnswer(""); setChecked(false); setScore({ ok: 0, ng: 0 }); setTestDone(false);
      await new Promise(r => setTimeout(r, 600));
      setPhase("cards");

    } catch (e) {
      addLog("エラー: " + e.message, "err");
      setErrMsg(e.message);
      setPhase("error");
    }
  };

  const rateCard = (ok) => {
    if (ok) setKnown(p => new Set([...p, idx]));
    else    setRetry(p => new Set([...p, idx]));
    setFlipped(false);
    setIdx(i => (i + 1) % cards.length);
  };

  const nextTest = (ok) => {
    setScore(s => ({ ok: s.ok + (ok ? 1 : 0), ng: s.ng + (ok ? 0 : 1) }));
    if (testIdx + 1 >= cards.length) { setTestDone(true); return; }
    setTestIdx(i => i + 1); setAnswer(""); setChecked(false);
  };

  const printPDF = () => {
    const w = window.open("", "_blank");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>MedCard AI</title>
<style>body{font-family:"Hiragino Sans","Yu Gothic",sans-serif;padding:40px;max-width:800px;margin:0 auto}
h1{font-size:22px;margin-bottom:4px}.meta{font-size:12px;color:#666;border-bottom:2px solid #ddd;padding-bottom:8px;margin-bottom:24px}
.card{margin-bottom:24px;padding-bottom:20px;border-bottom:1px dashed #ccc;page-break-inside:avoid}
.q{font-size:14px;font-weight:600;margin-bottom:12px;line-height:1.6}
.tag{display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;margin-left:8px;vertical-align:middle}
.high{background:#ffe0e0;color:#c0392b}.medium{background:#fff8d6;color:#b7860b}.low{background:#e8faf2;color:#1a7f4b}
.line{height:1px;background:#ccc;margin:7px 0}</style></head><body>
<h1>MedCard AI — 小テスト</h1>
<div class="meta">${new Date().toLocaleDateString("ja-JP")} ／ 全${cards.length}問</div>
${cards.map((c, i) => `<div class="card"><div class="q">Q${i + 1}. ${c.question}<span class="tag ${c.importance}">${IMP[c.importance]?.label || c.importance}</span></div><div class="line"></div><div class="line"></div></div>`).join("")}
</body></html>`);
    w.document.close(); setTimeout(() => w.print(), 400);
  };

  const btn     = (bg, color = "#0a0e1a", extra = {}) => ({ padding: "12px 24px", border: "none", borderRadius: 10, background: bg, color, fontSize: 14, fontWeight: 700, cursor: "pointer", ...extra });
  const outline = (color) => ({ padding: "10px 22px", border: `1px solid ${color}`, borderRadius: 10, background: "transparent", color, fontSize: 13, fontWeight: 700, cursor: "pointer" });

  const card     = cards[idx];
  const testCard = cards[testIdx];
  const canGen   = images.length > 0;

  return (
    <div style={{ background: "#0a0e1a", minHeight: "100vh" }}>
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity:0;transform:translateY(16px) } to { opacity:1;transform:translateY(0) } }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:.4} }
        .flip-card { perspective:1000px }
        .flip-inner { position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .5s cubic-bezier(.4,0,.2,1) }
        .flip-inner.flipped { transform:rotateY(180deg) }
        .flip-front,.flip-back { position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:18px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:32px }
        .flip-back { transform:rotateY(180deg) }
      `}</style>

      <div style={{ position: "fixed", inset: 0, backgroundImage: "linear-gradient(rgba(79,255,176,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(79,255,176,0.03) 1px,transparent 1px)", backgroundSize: "44px 44px", pointerEvents: "none", zIndex: 0 }} />

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 16px 80px", position: "relative", zIndex: 1 }}>

        {/* ヘッダー */}
        <div style={{ textAlign: "center", marginBottom: 40, animation: "fadeUp .5s ease" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(79,255,176,0.08)", border: "1px solid rgba(79,255,176,0.2)", borderRadius: 100, padding: "5px 16px", fontSize: 11, fontWeight: 700, color: C.acc, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 18 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.acc, display: "inline-block", animation: "pulse 2s infinite" }} /> Medical AI Study Tool
          </div>
          <h1 style={{ fontSize: "clamp(32px,7vw,56px)", fontWeight: 900, lineHeight: 1, marginBottom: 12, letterSpacing: "-0.03em" }}>
            Med<span style={{ background: `linear-gradient(120deg,${C.acc},${C.acc2})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Card</span> AI
          </h1>
          <p style={{ color: C.dim, fontSize: 15, lineHeight: 1.7, maxWidth: 420, margin: "0 auto" }}>
            教科書の写真を撮るだけ。<br />Gemini AIが読み取り、フラッシュカード・小テストを自動生成。
          </p>
        </div>

        {/* ── INPUT ── */}
        {phase === "input" && (
          <div style={{ animation: "fadeUp .4s ease" }}>
            <div style={{ background: C.surf, border: C.bdr, borderRadius: 20, padding: 24, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.acc, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(79,255,176,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>1</span>
                写真をアップロード（複数枚OK）
              </div>

              {images.length === 0 ? (
                <div
                  style={{ border: `2px dashed ${drag ? C.acc : "rgba(79,255,176,0.25)"}`, borderRadius: 14, padding: "44px 20px", textAlign: "center", cursor: "pointer", background: drag ? "rgba(79,255,176,0.05)" : C.surf2, transition: "all .2s" }}
                  onDragOver={e => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
                  onClick={() => fileRef.current?.click()}
                >
                  <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
                  <div style={{ fontSize: 44, marginBottom: 14 }}>📷</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>写真をタップして選択</div>
                  <div style={{ fontSize: 13, color: C.dim, marginBottom: 10 }}>複数選択可 · ドラッグ＆ドロップも可</div>
                  <div style={{ display: "inline-block", fontSize: 11, color: C.acc, background: "rgba(79,255,176,0.08)", border: "1px solid rgba(79,255,176,0.2)", borderRadius: 100, padding: "4px 12px" }}>JPG / PNG / WEBP</div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: C.acc, fontWeight: 700, marginBottom: 12 }}>{images.length}枚選択中</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(90px,1fr))", gap: 10, marginBottom: 12 }}>
                    {images.map((img, i) => (
                      <div key={i} style={{ position: "relative", aspectRatio: "3/4", borderRadius: 10, overflow: "hidden", background: C.surf2, border: "2px solid rgba(79,255,176,0.3)" }}>
                        <img src={img.url} alt={`p${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        <button style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.75)", border: "none", color: "#fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                          onClick={() => setImages(p => p.filter((_, j) => j !== i))}>✕</button>
                      </div>
                    ))}
                    <div style={{ aspectRatio: "3/4", borderRadius: 10, border: "2px dashed rgba(255,255,255,0.1)", background: C.surf2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.dim, fontSize: 22, gap: 4, position: "relative" }}
                      onClick={() => fileRef2.current?.click()}>
                      <input ref={fileRef2} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
                      <span>＋</span><span style={{ fontSize: 11 }}>追加</span>
                    </div>
                  </div>
                  <button style={{ ...outline(C.danger), fontSize: 12, padding: "6px 14px" }} onClick={() => setImages([])}>✕ すべて削除</button>
                </>
              )}
            </div>

            <div style={{ background: C.surf, border: C.bdr, borderRadius: 20, padding: 24, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.acc, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(79,255,176,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>2</span>
                重要箇所の判断方法
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                {[
                  { id: "ai",   icon: "🤖", title: "AIが自動判断",    desc: "医学的重要度をGemini AIが判断してカードを生成します。" },
                  { id: "mark", icon: "🖊️", title: "マーク箇所を優先", desc: "蛍光ペン・印・囲みなど、マークした箇所を優先します。" },
                ].map(m => (
                  <div key={m.id}
                    style={{ border: `1px solid ${mode === m.id ? C.acc : "rgba(255,255,255,0.07)"}`, borderRadius: 14, padding: "16px 14px", cursor: "pointer", background: mode === m.id ? "rgba(79,255,176,0.06)" : C.surf2, transition: "all .2s", position: "relative" }}
                    onClick={() => setMode(m.id)}>
                    {mode === m.id && <div style={{ position: "absolute", top: 10, right: 10, width: 18, height: 18, borderRadius: "50%", background: C.acc, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#0a0e1a", fontWeight: 900 }}>✓</div>}
                    <div style={{ fontSize: 26, marginBottom: 8 }}>{m.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{m.title}</div>
                    <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.55 }}>{m.desc}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: C.surf2, border: C.bdr, borderRadius: 10, padding: "12px 16px", marginBottom: 20 }}>
                <span style={{ fontSize: 13, color: C.dim, whiteSpace: "nowrap" }}>カード枚数</span>
                <input type="range" min={3} max={20} value={count} onChange={e => setCount(+e.target.value)} style={{ flex: 1, accentColor: C.acc }} />
                <span style={{ fontSize: 16, fontWeight: 800, color: C.acc, minWidth: 28, textAlign: "right" }}>{count}</span>
              </div>
              <button
                style={{ ...btn(canGen ? `linear-gradient(135deg,${C.acc},${C.acc2})` : "rgba(79,255,176,0.2)"), width: "100%", fontSize: 16, padding: "15px", opacity: canGen ? 1 : 0.5, cursor: canGen ? "pointer" : "not-allowed" }}
                disabled={!canGen}
                onClick={generate}
              >
                ✦ カードを生成する
              </button>
            </div>
          </div>
        )}

        {/* ── LOADING ── */}
        {phase === "loading" && (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ textAlign: "center", padding: "48px 16px 28px" }}>
              <div style={{ position: "relative", width: 80, height: 80, margin: "0 auto 24px" }}>
                <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid transparent", borderTopColor: C.acc, animation: "spin 1.2s linear infinite" }} />
                <div style={{ position: "absolute", inset: 9, borderRadius: "50%", border: "3px solid transparent", borderRightColor: C.acc2, animation: "spin 1.8s linear infinite reverse" }} />
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🧠</div>
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{loadTitle}</div>
              <div style={{ fontSize: 12, color: C.dim, marginBottom: 18 }}>{loadSub}</div>
              <div style={{ maxWidth: 360, margin: "0 auto 20px", background: C.surf2, borderRadius: 100, height: 7, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progress}%`, background: `linear-gradient(90deg,${C.acc},${C.acc2})`, borderRadius: 100, transition: "width .5s ease" }} />
              </div>
              {images.length > 0 && (
                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 20 }}>
                  {images.map((img, i) => {
                    const isDone = doneSet.has(i);
                    const isCur  = !isDone && !Array.from(doneSet).includes(i) && i === images.findIndex((_, j) => !doneSet.has(j));
                    return (
                      <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <img src={img.url} alt={`p${i}`} style={{ width: 50, height: 64, objectFit: "cover", borderRadius: 7, border: `2px solid ${isDone ? C.acc : isCur ? C.acc2 : "rgba(255,255,255,0.1)"}`, transition: "all .3s" }} />
                        <span style={{ fontSize: 9, fontWeight: 700, color: isDone ? C.acc : isCur ? C.acc2 : C.dim }}>
                          {isDone ? "✓ 完了" : isCur ? "解析中..." : "待機中"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{ background: C.surf, border: C.bdr, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "9px 14px", fontSize: 10, fontWeight: 700, color: C.dim, letterSpacing: "0.07em", borderBottom: C.bdr, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.acc, animation: "pulse 1.5s infinite", display: "inline-block" }} /> 処理ログ
              </div>
              <div ref={logRef} style={{ padding: "10px 14px", maxHeight: 150, overflowY: "auto" }}>
                {logs.map((l, i) => (
                  <div key={i} style={{ display: "flex", gap: 9, marginBottom: 3, fontSize: 11, alignItems: "flex-start" }}>
                    <span style={{ color: C.dim, fontFamily: "monospace", opacity: .55, flexShrink: 0, fontSize: 10 }}>{l.t}</span>
                    <span style={{ color: l.type === "ok" ? C.acc : l.type === "err" ? C.danger : C.dim }}>{l.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── ERROR ── */}
        {phase === "error" && (
          <div style={{ background: "rgba(255,107,107,0.07)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 18, padding: 28, textAlign: "center", animation: "fadeUp .3s ease" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.danger, marginBottom: 12 }}>エラーが発生しました</div>
            <pre style={{ fontSize: 12, color: C.dim, background: C.surf2, borderRadius: 10, padding: "12px 16px", textAlign: "left", whiteSpace: "pre-wrap", wordBreak: "break-all", marginBottom: 20, maxHeight: 200, overflowY: "auto" }}>{errMsg}</pre>
            <button style={btn(`linear-gradient(135deg,${C.acc},${C.acc2})`)} onClick={() => { setPhase("input"); setImages([]); }}>↩ やり直す</button>
          </div>
        )}

        {/* ── RESULTS タブ ── */}
        {(phase === "cards" || phase === "test") && (
          <>
            <div style={{ display: "flex", gap: 4, background: C.surf, border: C.bdr, borderRadius: 14, padding: 5, marginBottom: 20 }}>
              {[["cards", "🃏 フラッシュカード"], ["test", "📝 小テスト"]].map(([id, label]) => (
                <button key={id}
                  style={{ flex: 1, padding: 11, border: "none", borderRadius: 11, background: phase === id ? C.surf2 : "transparent", color: phase === id ? "#e8edf5" : C.dim, fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all .2s", boxShadow: phase === id ? "0 2px 8px rgba(0,0,0,.3)" : "none" }}
                  onClick={() => setPhase(id)}>{label}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {[["全", cards.length, C.acc], ["重要度高", cards.filter(c => c.importance === "high").length, C.danger], ["覚えた", known.size, C.acc], ["要復習", retry.size, C.warn]].map(([l, v, c]) => (
                <div key={l} style={{ background: C.surf, border: C.bdr, borderRadius: 10, padding: "7px 14px", fontSize: 12, color: C.dim }}>
                  {l} <b style={{ color: c }}>{v}</b>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── フラッシュカード ── */}
        {phase === "cards" && card && (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, marginBottom: 20 }}>
              <button style={{ width: 36, height: 36, borderRadius: "50%", border: C.bdr, background: C.surf, color: "#e8edf5", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => { setIdx(i => (i - 1 + cards.length) % cards.length); setFlipped(false); }}>←</button>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.dim }}><b style={{ color: C.acc }}>{idx + 1}</b> / {cards.length}</span>
              <button style={{ width: 36, height: 36, borderRadius: "50%", border: C.bdr, background: C.surf, color: "#e8edf5", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => { setIdx(i => (i + 1) % cards.length); setFlipped(false); }}>→</button>
            </div>
            <div className="flip-card" style={{ height: 260, cursor: "pointer", marginBottom: 14 }} onClick={() => setFlipped(f => !f)}>
              <div className={`flip-inner${flipped ? " flipped" : ""}`} style={{ height: "100%" }}>
                <div className="flip-front" style={{ background: C.surf, border: C.bdr }}>
                  <span style={{ position: "absolute", top: 13, left: 16, fontSize: 9, fontWeight: 700, letterSpacing: ".12em", color: C.acc }}>QUESTION</span>
                  <span style={{ position: "absolute", top: 10, right: 14, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 100, background: IMP[card.importance]?.bg, color: IMP[card.importance]?.color }}>{IMP[card.importance]?.label}</span>
                  <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.65 }}>{card.question}</div>
                  <span style={{ position: "absolute", bottom: 12, fontSize: 11, color: C.dim }}>タップして答えを確認 →</span>
                </div>
                <div className="flip-back" style={{ background: `linear-gradient(135deg,rgba(79,255,176,.07),rgba(0,200,255,.07))`, border: "1px solid rgba(79,255,176,.2)" }}>
                  <span style={{ position: "absolute", top: 13, left: 16, fontSize: 9, fontWeight: 700, letterSpacing: ".12em", color: C.acc2 }}>ANSWER</span>
                  <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.6 }}>{card.answer}</div>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 24 }}>
              <button style={{ ...outline(C.danger), minWidth: 120 }} onClick={() => rateCard(false)}>✗ もう一度</button>
              <button style={{ ...outline(C.acc), minWidth: 120 }} onClick={() => rateCard(true)}>✓ 覚えた！</button>
            </div>
            <div style={{ background: C.surf, border: C.bdr, borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
              <div style={{ padding: "13px 18px", fontSize: 11, fontWeight: 700, color: C.dim, borderBottom: C.bdr, letterSpacing: ".05em" }}>カード一覧</div>
              {cards.map((c, i) => (
                <div key={i} onClick={() => { setIdx(i); setFlipped(false); }}
                  style={{ padding: "11px 18px", borderBottom: i < cards.length - 1 ? C.bdr : "none", cursor: "pointer", background: i === idx ? "rgba(79,255,176,.04)" : "transparent", display: "flex", alignItems: "center", gap: 10, transition: "background .15s" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: IMP[c.importance]?.dot || C.dim, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: i === idx ? "#e8edf5" : C.dim, flex: 1 }}>{c.question}</span>
                  {known.has(i) && <span style={{ fontSize: 10, color: C.acc }}>✓</span>}
                  {retry.has(i) && <span style={{ fontSize: 10, color: C.danger }}>↩</span>}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...outline(C.dim), flex: 1 }} onClick={() => { setPhase("input"); setImages([]); setCards([]); }}>↩ 最初から</button>
              <button style={{ ...outline(C.dim), flex: 1 }} onClick={printPDF}>🖨️ 印刷</button>
            </div>
          </div>
        )}

        {/* ── 小テスト ── */}
        {phase === "test" && !testDone && testCard && (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ background: C.surf2, borderRadius: 100, height: 5, marginBottom: 18, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(testIdx / cards.length) * 100}%`, background: `linear-gradient(90deg,${C.acc},${C.acc2})`, borderRadius: 100, transition: "width .4s" }} />
            </div>
            <div style={{ background: C.surf, border: C.bdr, borderRadius: 18, padding: 26, marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontSize: 12, color: C.dim, fontWeight: 700 }}>問題 {testIdx + 1} / {cards.length}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 100, background: IMP[testCard.importance]?.bg, color: IMP[testCard.importance]?.color }}>{IMP[testCard.importance]?.label}</span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.7, marginBottom: 20 }}>{testCard.question}</div>
              {!checked ? (
                <>
                  <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="答えを入力してください..." rows={3}
                    style={{ width: "100%", background: C.surf2, border: C.bdr, borderRadius: 10, padding: "12px 14px", color: "#e8edf5", fontSize: 14, resize: "none", outline: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: 13 }} />
                  <button style={{ ...btn(`linear-gradient(135deg,${C.acc},${C.acc2})`), width: "100%" }} onClick={() => setChecked(true)}>答え合わせ</button>
                </>
              ) : (
                <>
                  <div style={{ background: C.surf2, borderRadius: 10, padding: "13px 15px", marginBottom: 13 }}>
                    <div style={{ fontSize: 10, color: C.dim, fontWeight: 700, marginBottom: 5 }}>あなたの回答</div>
                    <div style={{ fontSize: 14 }}>{answer || "（未記入）"}</div>
                  </div>
                  <div style={{ background: "rgba(79,255,176,.06)", border: "1px solid rgba(79,255,176,.2)", borderRadius: 10, padding: "13px 15px", marginBottom: 18 }}>
                    <div style={{ fontSize: 10, color: C.acc, fontWeight: 700, marginBottom: 5 }}>正解</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{testCard.answer}</div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button style={{ ...outline(C.danger), flex: 1 }} onClick={() => nextTest(false)}>✗ 不正解</button>
                    <button style={{ ...outline(C.acc), flex: 1 }} onClick={() => nextTest(true)}>✓ 正解</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── テスト結果 ── */}
        {phase === "test" && testDone && (
          <div style={{ textAlign: "center", padding: "40px 20px", animation: "fadeUp .4s ease" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>{score.ok / cards.length >= 0.8 ? "🎉" : score.ok / cards.length >= 0.5 ? "😊" : "💪"}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>テスト完了！</div>
            <div style={{ fontSize: 15, color: C.dim, marginBottom: 28 }}>
              正解 <b style={{ color: C.acc, fontSize: 22 }}>{score.ok}</b> / {cards.length} 問（{Math.round((score.ok / cards.length) * 100)}%）
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button style={btn(`linear-gradient(135deg,${C.acc},${C.acc2})`)} onClick={() => { setTestIdx(0); setAnswer(""); setChecked(false); setScore({ ok: 0, ng: 0 }); setTestDone(false); }}>もう一度テスト</button>
              <button style={outline(C.dim)} onClick={() => { setPhase("input"); setImages([]); setCards([]); }}>最初から</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
