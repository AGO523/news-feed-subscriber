import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
  API_GATEWAY_URL: string;
  API_GATEWAY_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/cron", async (c) => {
  const db = c.env.DB;
  const gatewayUrl = c.env.API_GATEWAY_URL;
  const apiKey = c.env.API_GATEWAY_KEY;

  if (!gatewayUrl || !apiKey) {
    return c.json(
      { error: "API_GATEWAY_URLまたはAPI_GATEWAY_KEYが未設定です" },
      500
    );
  }

  const { results } = await db
    .prepare("SELECT * FROM news WHERE subscriptionStatus = ?")
    .bind("subscribed")
    .all();

  for (const row of results) {
    const rawPrompt = typeof row.prompt === "string" ? row.prompt : "";
    const formatedPrompt = rawPrompt.replace(
      "あなたは優秀なリサーチャーです。",
      "あなたは優秀なリサーチャーです。次の1と2のルールを絶対に遵守してください。1: 結果には要約文とニュースソースだけを記載してください。2: メールで文章を表示することを前提として、読みやすい結果にしてください。"
    );

    const message = {
      id: row.id,
      uuid: crypto.randomUUID(),
      email: row.email,
      topic: row.topic,
      optionalText:
        typeof row.optionalText === "string" ? row.optionalText : "",
      repositoryName: row.repositoryName,
      prompt: formatedPrompt,
      createdAt: Date.now(),
    };

    const encoded = btoa(JSON.stringify(message));

    const payload = {
      messages: [
        {
          data: encoded,
        },
      ],
    };

    try {
      const res = await fetch(`${gatewayUrl}/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      console.log(`Sent message ${message.id}, response:`, text);
    } catch (e) {
      console.error(`Failed to send message ${message.id}`, e);
    }
  }

  return c.json({ message: `${results.length} messages processed.` });
});

export default app;
