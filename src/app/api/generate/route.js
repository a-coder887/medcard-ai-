export async function POST(req) {
  try {
    const body = await req.json();
    const { mode, count, ocrOnly } = body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return Response.json({ error: "GEMINI_API_KEY が未設定です" }, { status: 500 });
    }

    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    // ── モード1: OCRのみ（画像→テキスト） ──
    if (ocrOnly) {
      const { imageBase64, mimeType } = body;
      if (!imageBase64) {
        return Response.json({ error: "画像がありません" }, { status: 400 });
      }

      const markNote = mode === "mark"
        ? "蛍光ペン・マーカー・印・囲み・下線などユーザーがマークした箇所には【重要】とマークして出力してください。"
        : "";

      const prompt = `この医学教科書・ノートの画像に書かれているテキストをすべて正確に読み取ってください。${markNote}テキストのみを出力してください。`;

      let res;
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(GEMINI_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              { inline_data: { mime_type: mimeType || "image/jpeg", data: imageBase64 } },
              { text: prompt }
            ]}],
            generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
          })
        });
        if (res.status === 429) {
          // レート制限：5秒待ってリトライ
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }
        break;
      }

      if (!res.ok) {
        const err = await res.text();
        return Response.json({ error: `OCR エラー (${res.status}): ${err.slice(0, 300)}` }, { status: 500 });
      }

      const data = await res.json();
      if (data.error) {
        return Response.json({ error: `Gemini エラー: ${data.error.message}` }, { status: 500 });
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return Response.json({ text });
    }

    // ── モード2: テキスト→カード生成 ──
    const { text } = body;
    if (!text) {
      return Response.json({ error: "テキストがありません" }, { status: 400 });
    }

    const modePrompt = mode === "mark"
      ? "テキスト内の【重要】マークが付いた箇所を優先的に問題にしてください。【重要】マークがなければ医学的に重要な箇所を選んでください。"
      : "医学的に重要な用語・数値・定義・メカニズムを判断して問題にしてください。";

    const prompt = `あなたは医学教育の専門家です。以下のテキストから学習用フラッシュカードを${count}枚作成してください。

【指示】
${modePrompt}

【テキスト】
${text}

【出力形式】
以下のJSON形式のみで回答してください。説明・前置き・マークダウン記号は一切不要です。

{"cards":[{"question":"問題文","answer":"答え","importance":"high","type":"term"}]}

importanceは high / medium / low のいずれか。
typeは term / value / mechanism / other のいずれか。
必ず${count}枚作成し、JSONのみを返してください。`;

    const res2 = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
      })
    });

    if (!res2.ok) {
      const err = await res2.text();
      return Response.json({ error: `カード生成エラー (${res2.status}): ${err.slice(0, 300)}` }, { status: 500 });
    }

    const data2 = await res2.json();
    if (data2.error) {
      return Response.json({ error: `Gemini エラー: ${data2.error.message}` }, { status: 500 });
    }

    const raw = data2.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: "AIの応答からJSONを取得できませんでした。\n\nAI応答:\n" + raw.slice(0, 500) }, { status: 500 });
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return Response.json({ error: "JSONパースエラー: " + e.message + "\n\n応答:\n" + jsonMatch[0].slice(0, 300) }, { status: 500 });
    }

    if (!parsed.cards?.length) {
      return Response.json({ error: "カードが生成されませんでした。\n\n応答:\n" + raw.slice(0, 300) }, { status: 500 });
    }

    return Response.json({ cards: parsed.cards });

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
