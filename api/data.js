const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const headers = { Authorization: `Bearer ${REDIS_TOKEN}` };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { key } = req.query;
  if (!key) return res.status(400).json({ error: "key is required" });

  // GET
  if (req.method === "GET") {
    const r = await fetch(
      `${REDIS_URL}/get/${encodeURIComponent(key)}`,
      { headers }
    );
    const { result } = await r.json();
    if (!result) return res.status(200).json({ value: null });
    try {
      return res.status(200).json({ value: JSON.parse(result) });
    } catch {
      return res.status(200).json({ value: result });
    }
  }

  // POST - Upstash pipeline方式で確実に書き込む
  if (req.method === "POST") {
    // bodyを読む
    let raw = "";
    for await (const chunk of req) raw += chunk;
    
    let value;
    try {
      value = JSON.parse(raw).value;
    } catch {
      return res.status(400).json({ error: "invalid body" });
    }

    // Upstash pipeline API（最も確実な方式）
    const r = await fetch(`${REDIS_URL}/pipeline`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["SET", key, JSON.stringify(value)]
      ]),
    });
    const result = await r.json();
    return res.status(200).json({ ok: true, result });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
