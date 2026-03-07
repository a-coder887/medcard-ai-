"use client";
import { useState, useRef, useCallback } from "react";

/* ══════════════════════════════════════════════════════
   画像リサイズ
══════════════════════════════════════════════════════ */
function resizeImage(file, maxPx = 1600) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`読み込み失敗: ${file.name}`));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error(`デコード失敗: ${file.name}`));
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > maxPx || h > maxPx) {
          const r = Math.min(maxPx / w, maxPx / h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
        const base64  = dataUrl.split(",")[1];
        resolve({ base64, url: dataUrl, w, h, name: file.name });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ══════════════════════════════════════════════════════
   カード生成（ルールベース）
══════════════════════════════════════════════════════ */
function generateCards(rawText, mode, targetCount) {
  const lines = rawText.split(/[\n。．]/).map(l => l.trim()).filter(l => l.length > 3);
  const cards = [];
  const used = new Set();

  const push = (q, a, imp) => {
    const key = q.slice(0, 40);
    if (!used.has(key) && q.length > 4 && a.length > 0) {
      used.add(key);
      cards.push({ question: q, answer: a, importance: imp });
    }
  };

  for (const line of lines) {
    if (cards.length >= targetCount * 4) break;

    const parens = line.match(/(.{1,20})[（(]([A-Za-z][A-Za-z\s\-]{1,30})[)）]/);
    if (parens) {
      push(`「${parens[1].trim()}」の英語名は？`, parens[2].trim(), "high");
      push(`"${parens[2].trim()}" の日本語名は？`, parens[1].trim(), "high");
    }

    const colon = line.match(/^(.{2,20})[：:]\s*(.{4,})$/);
    if (colon) push(`${colon[1].trim()} とは何か？`, colon[2].trim(), "high");

    const numM = line.match(/(.{2,20})は\s*([\d.]+\s*(?:mmHg|bpm|mg\/dL|mg|μg|mEq|mL|L\/分|kg|cm|mm|秒|分|時間|℃|度|％|%))/);
    if (numM) push(`${numM[1].trim()} の正常値・基準値は？`, numM[2].trim(), "high");

    const isA = line.match(/^(.{3,20})は(.{3,40})(である|する|を行う|を担う|に位置|から成る|によって|を示す)$/);
    if (isA) push(`（　　）は${isA[2]}${isA[3]}。（空欄を答えよ）`, isA[1].trim(), "medium");

    if (mode === "highlight" && /★|☆|※|▶|■|◆|重要|POINT|ポイント|注意|Check/.test(line)) {
      const clean = line.replace(/★|☆|※|▶|■|◆|重要|POINT|ポイント|注意|Check/g, "").trim();
      if (clean.length > 4) push(`次の重要事項を答えよ：${clean.slice(0, 40)}`, clean, "high");
    }

    if (line.length >= 12 && line.length <= 100) {
      const m = line.match(/^([^\s、,，]{2,10})([\s、,，].+)$/);
      if (m) push(`（　　）${m[2].trim()}（空欄を答えよ）`, m[1], "low");
    }
  }

  const order = { high: 0, medium: 1, low: 2 };
  cards.sort((a, b) => order[a.importance] - order[b.importance]);
  return cards.slice(0, targetCount);
}

/* ══════════════════════════════════════════════════════
   定数
══════════════════════════════════════════════════════ */
const IMP = {
  high:   { label: "重要度：高", bg: "rgba(255,107,107,0.15)", color: "#ff6b6b", border: "rgba(255,107,107,0.3)"  },
  medium: { label: "重要度：中", bg: "rgba(255,221,87,0.12)",  color: "#ffdd57", border: "rgba(255,221,87,0.25)" },
  low:    { label: "重要度：低", bg: "rgba(79,255,176,0.1)",   color: "#4fffb0", border: "rgba(79,255,176,0.2)"  },
};

/* ══════════════════════════════════════════════════════
   メインコンポーネント
══════════════════════════════════════════════════════ */
export default function MedCardAI() {
  const [inputMode, setInputMode] = useState("image"); // "image" | "text"
  const [images,    setImages]    = useState([]);
  const [text,      setText]      = useState("");
  const [mode,      setMode]      = useState(null);
  const [count,     setCount]     = useState(10);
  const [phase,     setPhase]     = useState("input"); // input | loading | results | error
  const [statusMsg, setStatusMsg] = useState("");
  const [progress,  setProgress]  = useState(0);
  const [logs,      setLogs]      = useState([]);
  const [errDetail, setErrDetail] = useState("");
  const [cards,     setCards]     = useState([]);
  const [cur,       setCur]       = useState(0);
  const [flipped,   setFlipped]   = useState(false);
  const [known,     setKnown]     = useState(new Set());
  const [unk,       setUnk]       = useState(new Set());
  const [tab,       setTab]       = useState("fc");
  const [showAns,   setShowAns]   = useState(false);
  const [drag,      setDrag]      = useState(false);
  const [ocrTexts,  setOcrTexts]  = useState([]);
  const fileRef  = useRef();
  const fileRef2 = useRef();
  const logRef   = useRef();

  const log = useCallback((msg, type = "") => {
    const t = new Date().toTimeString().slice(0, 8);
    setLogs(p => [...p, { t, msg, type }]);
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = 9999; }, 40);
  }, []);

  const addFiles = async (files) => {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      try {
        const img = await resizeImage(f);
        setImages(p => [...p, { ...img, ocrDone: false }]);
      } catch (e) { alert(`⚠ ${e.message}`); }
    }
  };

  /* ── OCR + カード生成 ── */
  const generate = async () => {
    const isImage = inputMode === "image";
    if (isImage && !images.length) return;
    if (!isImage && !text.trim()) return;
    if (!mode) return;

    setPhase("loading"); setLogs([]); setProgress(0); setOcrTexts([]);

    try {
      let combined = "";

      if (isImage) {
        setStatusMsg("📷 Gemini AIで画像を読み取り中...");
        const texts = [];

        for (let i = 0; i < images.length; i++) {
          setStatusMsg(`📷 画像 ${i + 1} / ${images.length} を解析中...`);
          setProgress(Math.round((i / images.length) * 70));
          log(`画像 ${i + 1}/${images.length} をGemini APIに送信中...`);

          const res = await fetch("/api/ocr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64: images[i].base64,
              mimeType: "image/jpeg",
            }),
          });

          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || "OCR失敗");

          log(`画像 ${i + 1} 完了: ${data.text.length}文字`);
          texts.push(data.text);
          setImages(p => p.map((img, idx) => idx === i ? { ...img, ocrDone: true } : img));
        }

        combined = texts.join("\n\n");
        setOcrTexts(texts);
        log(`合計テキスト: ${combined.length}文字`);

      } else {
        combined = text;
        log(`テキスト入力: ${combined.length}文字`);
      }

      setProgress(80);
      setStatusMsg("✍️ フラッシュカードを生成中...");
      log("カード生成中...");

      await new Promise(r => setTimeout(r, 100));
      const generated = generateCards(combined, mode, count);

      if (!generated.length) {
        throw new Error(
          "問題を生成できませんでした。\n" +
          "・画像が鮮明でない可能性があります\n" +
          "・テキストが少なすぎる可能性があります\n\n" +
          (ocrTexts.length ? `OCR結果（先頭200文字）:\n${combined.slice(0, 200)}` : "")
        );
      }

      setProgress(100);
      log(`✓ ${generated.length}枚生成`, "ok");

      setCards(generated);
      setCur(0); setFlipped(false);
      setKnown(new Set()); setUnk(new Set());
      setTab("fc"); setShowAns(false);
      await new Promise(r => setTimeout(r, 300));
      setPhase("results");

    } catch (e) {
      log("エラー: " + e.message, "err");
      setErrDetail(e.message);
      setPhase("error");
    }
  };

  const rate = (ok) => {
    const idx = cur;
    if (ok) setKnown(p => { const s = new Set(p); s.add(idx); return s; });
    else     setUnk(p  => { const s = new Set(p); s.add(idx); return s; });
    setFlipped(false);
    setCur(c => (c + 1) % cards.length);
  };

  const printPDF = () => {
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>MedCard AI</title>
<style>body{font-family:sans-serif;padding:40px;max-width:760px;margin:0 auto}
h2{font-size:20px;font-weight:800;margin-bottom:4px}
.meta{font-size:12px;color:#666;border-bottom:2px solid #eee;padding-bottom:10px;margin-bottom:22px}
.block{margin-bottom:22px;padding-bottom:20px;border-bottom:1px dashed #ddd;page-break-inside:avoid}
.qt{font-size:14px;font-weight:600;margin-bottom:10px;line-height:1.55}
.imp{display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;margin-left:6px}
.high{background:#ffe0e0;color:#c0392b}.med{background:#fff8d6;color:#b7860b}.low{background:#e8faf2;color:#1a7f4b}
.blank{height:1px;background:#bbb;margin:8px 0}
.ans{font-size:13px;color:#1a7f4b;padding:8px 12px;background:#f0fff8;border-radius:6px;border-left:3px solid #1a7f4b;margin-top:6px}
</style></head><body>
<h2>MedCard AI — 穴埋めテスト</h2>
<div class="meta">${new Date().toLocaleDateString("ja-JP")} ／ 全${cards.length}問</div>
${cards.map((c, i) => {
  const ic = { high: "high", medium: "med", low: "low" }[c.importance];
  const il = { high: "重要度高", medium: "重要度中", low: "重要度低" }[c.importance];
  return `<div class="block"><div class="qt">Q${i + 1}. ${c.question}<span class="imp ${ic}">${il}</span></div>${showAns ? `<div class="ans">A. ${c.answer}</div>` : `<div class="blank"></div><div class="blank"></div><div class="blank"></div>`}</div>`;
}).join("")}
</body></html>`);
    w.document.close(); setTimeout(() => w.print(), 500);
  };

  /* ── スタイル ── */
  const acc = "#4fffb0", acc2 = "#00c8ff", dim = "#7a8ba0";
  const surf = "#111827", surf2 = "#1a2234", bdr = "1px solid rgba(255,255,255,0.07)";
  const card = cards[cur];
  const highN = cards.filter(c => c.importance === "high").length;
  const canGen = mode !== null && (inputMode === "image" ? images.length > 0 : text.trim().length > 20);
  const box = { background: surf, border: bdr, borderRadius: 20, padding: 24, marginBottom: 16 };
  const secBtn = { flex: 1, minWidth: 130, padding: "11px 16px", border: bdr, borderRadius: 10, background: surf, color: "#e8edf5", fontSize: 13, fontWeight: 700, cursor: "pointer" };
  const sn = { width: 22, height: 22, background: "rgba(79,255,176,0.12)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0 };

  return (
    <div style={{ background: "#0a0e1a", minHeight: "100vh" }}>
      <style>{`
        @keyframes spin   { to{transform:rotate(360deg)} }
        @keyframes pulse2 { 0%,100%{transform:scale(1)} 50%{transform:scale(1.12)} }
        @keyframes dotB   { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
      <div style={{ position: "fixed", inset: 0, backgroundImage: "linear-gradient(rgba(79,255,176,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(79,255,176,0.025) 1px,transparent 1px)", backgroundSize: "44px 44px", pointerEvents: "none", zIndex: 0 }} />

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "36px 16px 80px", position: "relative", zIndex: 1 }}>

        {/* ── ヘッダー ── */}
        <div style={{ textAlign: "center", marginBottom: 36, animation: "fadeUp .5s ease" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(79,255,176,0.08)", border: "1px solid rgba(79,255,176,0.22)", borderRadius: 100, padding: "5px 14px", fontSize: 11, fontWeight: 600, color: acc, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 16 }}>
            <span style={{ width: 7, height: 7, background: acc, borderRadius: "50%", display: "inline-block", animation: "pulse2 2s infinite" }} /> Medical AI Study Tool
          </div>
          <h1 style={{ fontSize: "clamp(28px,6vw,50px)", fontWeight: 800, lineHeight: 1.05, marginBottom: 10, letterSpacing: "-0.02em" }}>
            Med<span style={{ background: `linear-gradient(120deg,${acc},${acc2})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Card</span> AI
          </h1>
          <p style={{ color: dim, fontSize: 15, lineHeight: 1.65, maxWidth: 460, margin: "0 auto" }}>
            教科書の写真を撮るだけ。Gemini AIが読み取り、フラッシュカードと穴埋めテストを自動生成します。
          </p>
        </div>

        {/* ── INPUT / ERROR ── */}
        {(phase === "input" || phase === "error") && (<>

          {phase === "error" && (
            <div style={{ background: "rgba(255,107,107,0.07)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 16, padding: 24, marginBottom: 16, textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#ff6b6b", marginBottom: 8 }}>⚠ エラーが発生しました</div>
              <pre style={{ fontSize: 11, color: dim, background: surf2, borderRadius: 8, padding: "10px 12px", textAlign: "left", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 150, overflowY: "auto", marginBottom: 14 }}>{errDetail}</pre>
              <div style={{ maxWidth: 420, margin: "0 auto 14px", textAlign: "left", background: surf, border: bdr, borderRadius: 10, padding: "10px 14px", maxHeight: 100, overflowY: "auto", fontSize: 11 }}>
                {logs.map((l, i) => <div key={i} style={{ marginBottom: 3, display: "flex", gap: 8, color: l.type === "ok" ? acc : l.type === "err" ? "#ff6b6b" : dim }}><span style={{ opacity: .5, flexShrink: 0, fontFamily: "monospace" }}>{l.t}</span><span>{l.msg}</span></div>)}
              </div>
              <button style={{ padding: "10px 24px", border: "1px solid #ff6b6b", borderRadius: 8, background: "transparent", color: "#ff6b6b", fontWeight: 700, cursor: "pointer" }} onClick={() => setPhase("input")}>↩ やり直す</button>
            </div>
          )}

          {/* 入力モード切替 */}
          <div style={{ display: "flex", gap: 4, background: surf, border: bdr, borderRadius: 14, padding: 6, marginBottom: 16 }}>
            {[["image", "📷 画像から生成"], ["text", "✍️ テキストから生成"]].map(([id, label]) => (
              <button key={id} style={{ flex: 1, padding: "11px 8px", border: "none", borderRadius: 11, background: inputMode === id ? surf2 : "transparent", color: inputMode === id ? "#e8edf5" : dim, fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all .2s", boxShadow: inputMode === id ? "0 2px 8px rgba(0,0,0,.35)" : "none" }} onClick={() => setInputMode(id)}>{label}</button>
            ))}
          </div>

          {/* Step 1: 入力 */}
          <div style={box}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: acc, marginBottom: 16 }}>
              <span style={sn}>1</span>
              {inputMode === "image" ? "教科書・ノートの写真をアップロード" : "テキストを入力・貼り付け"}
            </div>

            {inputMode === "image" ? (
              images.length === 0 ? (
                <div style={{ border: `2px dashed ${drag ? acc : "rgba(79,255,176,0.2)"}`, borderRadius: 14, padding: "36px 20px", textAlign: "center", cursor: "pointer", background: drag ? "rgba(79,255,176,0.04)" : surf2, transition: "all .25s" }}
                  onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                  onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
                  onClick={() => fileRef.current?.click()}>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: "none" }} onChange={e => addFiles(e.target.files)} />
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📷</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>写真をドラッグ＆ドロップ</div>
                  <div style={{ fontSize: 13, color: dim }}>またはタップして選択 · JPG / PNG · 複数枚OK</div>
                  <div style={{ fontSize: 12, color: dim, marginTop: 8, opacity: .7 }}>Gemini AIがテキストを自動で読み取ります</div>
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 10 }}>
                    {images.map((img, i) => (
                      <div key={i} style={{ position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "3/4", background: surf2 }}>
                        <img src={img.url} alt={`p${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <button style={{ position: "absolute", top: 5, right: 5, width: 22, height: 22, background: "rgba(0,0,0,.75)", border: "none", borderRadius: "50%", color: "#fff", fontSize: 11, cursor: "pointer" }} onClick={() => setImages(p => p.filter((_, idx) => idx !== i))}>✕</button>
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,.6)", fontSize: 10, color: img.ocrDone ? acc : "#fff", padding: "2px 6px", textAlign: "center" }}>
                          {img.ocrDone ? "✓ 読取済" : `${img.w}×${img.h}`}
                        </div>
                      </div>
                    ))}
                    <div style={{ border: "2px dashed rgba(255,255,255,.1)", borderRadius: 10, aspectRatio: "3/4", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", color: dim, fontSize: 22, gap: 4, position: "relative", overflow: "hidden" }}
                      onClick={() => fileRef2.current?.click()}>
                      <input ref={fileRef2} type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} onChange={e => addFiles(e.target.files)} />
                      <span>＋</span><span style={{ fontSize: 11 }}>追加</span>
                    </div>
                  </div>
                </>
              )
            ) : (
              <>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder={"例：\n心臓は4つの腔室（右心房・右心室・左心房・左心室）から構成される。\n血圧（Blood Pressure）：収縮期血圧が140mmHg以上で高血圧と定義する。\n★心不全：心臓のポンプ機能が低下し全身の血流需要を満たせない状態。"}
                  style={{ width: "100%", minHeight: 200, background: surf2, border: `1px solid ${text.length > 20 ? "rgba(79,255,176,0.3)" : bdr.slice(17)}`, borderRadius: 12, padding: "14px 16px", color: "#e8edf5", fontSize: 14, lineHeight: 1.7, resize: "vertical", outline: "none", fontFamily: "system-ui,sans-serif", boxSizing: "border-box", transition: "border-color .2s" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: dim }}>
                  <span>{text.length}文字</span>
                  {text.length > 0 && <button style={{ background: "transparent", border: "none", color: dim, fontSize: 12, cursor: "pointer" }} onClick={() => setText("")}>クリア</button>}
                </div>
              </>
            )}
          </div>

          {/* Step 2: モード */}
          <div style={{ ...box, opacity: canGen || mode === null ? 1 : 0.45, transition: "opacity .3s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: acc, marginBottom: 16 }}>
              <span style={sn}>2</span> 問題作成モードを選択
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              {[
                { id: "auto", icon: "🤖", title: "AI自動選択", desc: "用語・数値・定義文を自動検出して問題を生成します。" },
                { id: "highlight", icon: "⭐", title: "重要箇所優先", desc: "★・重要・POINTなどのマーク周辺を優先して問題化します。" },
              ].map(m => (
                <div key={m.id} style={{ border: `1px solid ${mode === m.id ? acc : "rgba(255,255,255,0.07)"}`, borderRadius: 13, padding: 16, cursor: "pointer", background: mode === m.id ? "rgba(79,255,176,0.05)" : surf2, transition: "all .2s", position: "relative" }} onClick={() => setMode(m.id)}>
                  {mode === m.id && <span style={{ position: "absolute", top: 11, right: 13, width: 19, height: 19, background: acc, color: "#0a0e1a", borderRadius: "50%", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>}
                  <div style={{ fontSize: 24, marginBottom: 8 }}>{m.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 5 }}>{m.title}</div>
                  <div style={{ fontSize: 12, color: dim, lineHeight: 1.55 }}>{m.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: surf2, border: bdr, borderRadius: 10, padding: "9px 16px", fontSize: 13, color: dim, flex: 1, minWidth: 180 }}>
                <span>カード枚数</span>
                <input type="range" min={3} max={20} value={count} onChange={e => setCount(+e.target.value)} style={{ flex: 1, accentColor: acc }} />
                <span style={{ fontWeight: 700, color: acc, minWidth: 22 }}>{count}</span>
              </div>
              <button
                style={{ flex: 1, minWidth: 200, padding: "13px 24px", border: "none", borderRadius: 11, background: canGen ? `linear-gradient(135deg,${acc},${acc2})` : "rgba(79,255,176,0.2)", color: "#0a0e1a", fontSize: 15, fontWeight: 800, cursor: canGen ? "pointer" : "not-allowed", opacity: canGen ? 1 : 0.5 }}
                disabled={!canGen} onClick={generate}>✦ 生成する</button>
            </div>
          </div>
        </>)}

        {/* ── LOADING ── */}
        {phase === "loading" && (
          <div style={{ textAlign: "center", padding: "44px 20px", animation: "fadeUp .3s ease" }}>
            <div style={{ position: "relative", width: 90, height: 90, margin: "0 auto 24px" }}>
              {[{ i: 0, c: acc, d: "1.2s", dir: "normal" }, { i: 10, c: acc2, d: "1.9s", dir: "reverse" }, { i: 20, c: "#ffdd57", d: "2.6s", dir: "normal" }].map((r, k) => (
                <div key={k} style={{ position: "absolute", inset: r.i, borderRadius: "50%", border: "3px solid transparent", borderTopColor: k === 0 ? r.c : "transparent", borderRightColor: k === 1 ? r.c : "transparent", borderBottomColor: k === 2 ? r.c : "transparent", animation: `spin ${r.d} linear infinite`, animationDirection: r.dir }} />
              ))}
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, animation: "pulse2 2s ease-in-out infinite" }}>🧠</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{statusMsg}</div>
            <div style={{ maxWidth: 420, margin: "0 auto 20px", background: surf2, borderRadius: 100, height: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: `linear-gradient(90deg,${acc},${acc2})`, borderRadius: 100, transition: "width .5s ease" }} />
            </div>
            <div style={{ fontSize: 14, color: dim, marginBottom: 20 }}>
              処理中{[0, 1, 2].map(i => <span key={i} style={{ display: "inline-block", animation: `dotB 1.4s ease-in-out ${i * .2}s infinite` }}>.</span>)}
            </div>
            <div ref={logRef} style={{ maxWidth: 420, margin: "0 auto", textAlign: "left", background: surf, border: bdr, borderRadius: 10, padding: "12px 14px", maxHeight: 130, overflowY: "auto", fontSize: 12 }}>
              {logs.map((l, i) => (
                <div key={i} style={{ marginBottom: 3, display: "flex", gap: 8, color: l.type === "ok" ? acc : l.type === "err" ? "#ff6b6b" : dim }}>
                  <span style={{ opacity: .5, flexShrink: 0, fontFamily: "monospace" }}>{l.t}</span><span>{l.msg}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {phase === "results" && card && (
          <div style={{ animation: "fadeUp .4s ease" }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
              {[["全", cards.length, acc], ["重要度高", highN, "#ff6b6b"], ["覚えた", known.size, acc], ["要復習", unk.size, "#ff6b6b"]].map(([l, v, c]) => (
                <div key={l} style={{ background: surf, border: bdr, borderRadius: 10, padding: "8px 16px", fontSize: 13, color: dim }}>{l} <b style={{ color: c }}>{v}</b></div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 4, background: surf, border: bdr, borderRadius: 14, padding: 6, marginBottom: 22 }}>
              {[["fc", "🃏 フラッシュカード"], ["pdf", "📄 穴埋めテスト"], ...(ocrTexts.length ? [["ocr", "📝 OCRテキスト"]] : [])].map(([id, label]) => (
                <button key={id} style={{ flex: 1, padding: "10px 6px", border: "none", borderRadius: 11, background: tab === id ? surf2 : "transparent", color: tab === id ? "#e8edf5" : dim, fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all .2s" }} onClick={() => setTab(id)}>{label}</button>
              ))}
            </div>

            {tab === "fc" && (<>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, marginBottom: 22 }}>
                <button style={{ width: 40, height: 40, border: bdr, borderRadius: "50%", background: surf, color: "#e8edf5", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => { setCur(c => (c - 1 + cards.length) % cards.length); setFlipped(false); }}>←</button>
                <div style={{ fontSize: 14, fontWeight: 700, color: dim, minWidth: 70, textAlign: "center" }}><span style={{ color: acc }}>{cur + 1}</span> / {cards.length}</div>
                <button style={{ width: 40, height: 40, border: bdr, borderRadius: "50%", background: surf, color: "#e8edf5", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => { setCur(c => (c + 1) % cards.length); setFlipped(false); }}>→</button>
              </div>
              <div style={{ perspective: 1100, height: 260, cursor: "pointer", marginBottom: 12 }} onClick={() => setFlipped(f => !f)}>
                <div style={{ width: "100%", height: "100%", position: "relative", transformStyle: "preserve-3d", transform: flipped ? "rotateY(180deg)" : "none", transition: "transform .55s cubic-bezier(.4,0,.2,1)" }}>
                  <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", borderRadius: 20, padding: "36px 32px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", background: surf, border: bdr }}>
                    <span style={{ position: "absolute", top: 14, left: 18, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: acc }}>QUESTION</span>
                    <span style={{ position: "absolute", top: 14, right: 18, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 100, background: IMP[card.importance]?.bg, color: IMP[card.importance]?.color, border: `1px solid ${IMP[card.importance]?.border}` }}>{IMP[card.importance]?.label}</span>
                    <div style={{ fontSize: 17, fontWeight: 500, lineHeight: 1.7 }}>{card.question}</div>
                  </div>
                  <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", borderRadius: 20, padding: "36px 32px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", background: "linear-gradient(135deg,rgba(79,255,176,0.07),rgba(0,200,255,0.07))", border: "1px solid rgba(79,255,176,0.18)", transform: "rotateY(180deg)" }}>
                    <span style={{ position: "absolute", top: 14, left: 18, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: acc2 }}>ANSWER</span>
                    <div style={{ fontSize: 16, lineHeight: 1.75 }}>{card.answer}</div>
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "center", fontSize: 12, color: dim, marginBottom: 18 }}>↑ タップして答えを確認</div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button style={{ padding: "9px 28px", border: "1px solid #ff6b6b", borderRadius: 8, background: "transparent", color: "#ff6b6b", fontSize: 13, fontWeight: 700, cursor: "pointer" }} onClick={() => rate(false)}>✗ もう一度</button>
                <button style={{ padding: "9px 28px", border: `1px solid ${acc}`, borderRadius: 8, background: "transparent", color: acc, fontSize: 13, fontWeight: 700, cursor: "pointer" }} onClick={() => rate(true)}>✓ 覚えた！</button>
              </div>
            </>)}

            {tab === "pdf" && (<>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: dim, marginBottom: 14 }}>
                <div style={{ width: 36, height: 20, background: showAns ? acc : surf2, border: bdr, borderRadius: 100, position: "relative", cursor: "pointer", transition: "background .2s" }} onClick={() => setShowAns(v => !v)}>
                  <div style={{ position: "absolute", top: 3, left: showAns ? 17 : 3, width: 12, height: 12, background: "#fff", borderRadius: "50%", transition: "left .2s" }} />
                </div>
                <span>{showAns ? "解答あり（答え合わせ用）" : "解答なし（問題用）"}</span>
              </div>
              <div style={{ background: "#fff", borderRadius: 12, padding: 28, color: "#111", marginBottom: 14 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>MedCard AI — 穴埋めテスト</h2>
                <div style={{ fontSize: 12, color: "#666", borderBottom: "2px solid #eee", paddingBottom: 10, marginBottom: 20 }}>{new Date().toLocaleDateString("ja-JP")} ／ 全{cards.length}問</div>
                {cards.map((c, i) => {
                  const ibg = { high: "#ffe0e0", medium: "#fff8d6", low: "#e8faf2" }[c.importance];
                  const iclr = { high: "#c0392b", medium: "#b7860b", low: "#1a7f4b" }[c.importance];
                  const il = { high: "重要度高", medium: "重要度中", low: "重要度低" }[c.importance];
                  return (
                    <div key={i} style={{ marginBottom: 20, paddingBottom: 18, borderBottom: "1px dashed #e0e0e0" }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 10, lineHeight: 1.55 }}>
                        Q{i + 1}. {c.question}<span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, marginLeft: 8, background: ibg, color: iclr, verticalAlign: "middle" }}>{il}</span>
                      </div>
                      {showAns ? <div style={{ fontSize: 13, color: "#1a7f4b", padding: "8px 12px", background: "#f0fff8", borderRadius: 6, borderLeft: "3px solid #1a7f4b" }}>A. {c.answer}</div>
                        : [0, 1, 2].map(j => <div key={j} style={{ height: 1, background: "#bbb", margin: "8px 0" }} />)}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button style={secBtn} onClick={() => navigator.clipboard.writeText(cards.map((c, i) => `Q${i + 1}. ${c.question}\nA. ${c.answer}`).join("\n\n"))}>📋 Q&Aをコピー</button>
                <button style={{ ...secBtn, background: "linear-gradient(135deg,#ff6b6b,#ff8e53)", border: "none", color: "#fff" }} onClick={printPDF}>🖨️ PDF印刷・保存</button>
              </div>
            </>)}

            {tab === "ocr" && (
              <div style={{ background: surf, border: bdr, borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: 13, color: dim, marginBottom: 12 }}>Gemini AIが読み取ったテキスト（確認用）</div>
                {ocrTexts.map((t, i) => (
                  <div key={i} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: acc, marginBottom: 6, letterSpacing: "0.08em" }}>PAGE {i + 1}</div>
                    <pre style={{ fontSize: 12, color: "#c8d8e8", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-all", background: surf2, borderRadius: 10, padding: "12px 14px", maxHeight: 300, overflowY: "auto" }}>{t || "（テキストなし）"}</pre>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button style={secBtn} onClick={() => { setPhase("input"); setImages([]); setCards([]); setOcrTexts([]); }}>↩ 最初からやり直す</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
