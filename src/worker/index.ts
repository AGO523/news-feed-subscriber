import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
  API_GATEWAY_URL: string;
  API_GATEWAY_KEY: string;
};

type News = {
  id: number;
  userId: number;
  email: string;
  topic: string;
  optionalText: string | null;
  progressStatus: string;
  subscriptionStatus: string;
  createdAt: number;
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
    .all<News>();

  for (const row of results) {
    console.log("row JSON:", JSON.stringify(row, null, 2));

    const promptTemplate = `
あなたは優秀なリサーチャーです。次の1と2のルールを絶対に遵守してください。
1: 結果には要約文とニュースソースだけを記載してください。
2: メールで文章を表示することを前提として、読みやすい結果にしてください。

私は「${row.topic}」について、最新の情報をキャッチアップしたいと考えています。
現在の日時を取得して、「${
      row.topic
    }」について、信頼性の高いニュースソースを3件検索して要約してください。
それぞれのニュースについて簡潔な要約と参照URLを必ず記載してください。
${row.optionalText ? `補足: ${row.optionalText}` : ""}`.trim();

    const message = {
      id: row.id,
      uuid: crypto.randomUUID(),
      email: row.email,
      topic: row.topic,
      optionalText: row.optionalText || "",
      repositoryName: "news-feed-subscriber",
      prompt: promptTemplate,
      createdAt: Date.now(),
    };

    const encoded = encodeBase64Utf8(JSON.stringify(message));

    const payload = {
      messages: [
        {
          data: encoded,
        },
      ],
    };

    console.log("gatewayUrl:", gatewayUrl);

    try {
      const res = await fetch(`${gatewayUrl}/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(payload),
      });

      const resText = await res.text();
      console.log(
        `Sent message ${message.id}, status: ${res.status}, body: ${resText}`
      );
    } catch (e) {
      console.error(`Failed to send message ${message.id}`, e);
    }
  }

  return { total: results.length };
}

function encodeBase64Utf8(str: string): string {
  const uint8Array = new TextEncoder().encode(str);
  let binary = "";
  for (const byte of uint8Array) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export default {
  fetch: app.fetch,

  async scheduled(env: Bindings) {
    await publishSubscribedNews(env);
  },
};
