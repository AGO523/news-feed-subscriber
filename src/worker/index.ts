import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
  API_GATEWAY_URL: string;
  API_GATEWAY_KEY: string;
};

type NewsRow = {
  id: number;
  email: string;
  topic: string;
  optionalText: string | null;
  prompt: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => c.text("Scheduled task only."));

app.get("/manual-test", async (c) => {
  const result = await publishSubscribedNews(c.env);
  return c.text(`Processed ${result.total} items.`);
});

async function publishSubscribedNews(
  env: Bindings
): Promise<{ total: number }> {
  const db = env.DB;
  const gatewayUrl = env.API_GATEWAY_URL;
  const apiKey = env.API_GATEWAY_KEY;

  if (!gatewayUrl || !apiKey) {
    console.error("環境変数が設定されていません");
    return { total: 0 };
  }

  const { results } = await db
    .prepare("SELECT * FROM news WHERE subscriptionStatus = ?")
    .bind("subscribed")
    .all<NewsRow>();

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
      optionalText: row.optionalText || "",
      repositoryName: "news-feed-subscriber",
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

  return { total: results.length };
}

export default {
  fetch: app.fetch,

  async scheduled(env: Bindings) {
    await publishSubscribedNews(env);
  },
};
