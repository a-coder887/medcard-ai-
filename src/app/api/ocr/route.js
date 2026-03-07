export async function POST(request) {
  try {
    const { imageBase64, mimeType } = await request.json();

    if (!imageBase64) {
      return Response.json({ error: "画像データがありません" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: mimeType || "image/jpeg",
                  data: imageBase64,
                }
              },
              {
                text: `この医学教科書・ノートの画像に書かれているテキストをすべて抽出してください。蛍光ペンでマークされている部分は【重要】とマークして出力してください。図・表のキャプションも含めてください。テキストのみを出力し、説明や前置きは不要です。`
              }
            ]
          }],
          generationConfig: { temperature: 0 }
        })
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Gemini API エラー: ${res.status} ${err.slice(0, 200)}` }, { status: 500 });
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return Response.json({ text });

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
