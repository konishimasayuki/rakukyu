const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisGet(key) {
  const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const json = await res.json();
  // Upstashはそのまま文字列を返す → JSON.parseする
  if (json.result === null || json.result === undefined) return null;
  try {
    return JSON.parse(json.result);
  } catch(e) {
    return json.result;
  }
}

async function redisSet(key, value) {
  // valueをJSON文字列にしてUpstashに保存
  const res = await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(JSON.stringify(value)), // Upstashは受け取った値をそのまま保存
  });
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { key } = req.query;
  if (!key) return res.status(400).json({ error: "key is required" });

  if (req.method === "GET") {
    try {
      const val = await redisGet(key);
      return res.status(200).json({ value: val });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === "POST") {
    try {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body);
      if (!body) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        body = JSON.parse(Buffer.concat(chunks).toString());
      }
      const { value } = body;
      await redisSet(key, value);
      return res.status(200).json({ ok: true });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
