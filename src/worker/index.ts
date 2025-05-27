import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/", (c) => c.json({ name: "Cloudflare" }));

app.get("/cron", async (c) => {
  const db = c.env.DB;

  const { results } = await db
    .prepare("SELECT * FROM news WHERE subscriptionStatus = ?")
    .bind("subscribed")
    .all();

  for (const row of results) {
    // 仮のAPIコール（後でfetchなどに置き換え）
    console.log(`Send to API: ${JSON.stringify(row)}`);
  }

  return c.json({ message: `${results.length} rows processed.` });
});

export default app;
