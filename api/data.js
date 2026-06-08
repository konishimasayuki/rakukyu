const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(cmd, ...args) {
  const res = await fetch(`${REDIS_URL}/${[cmd, ...args].map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const json = await res.json();
  return json.result;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { key } = req.query;
  if (!key) return res.status(400).json({ error: "key is required" });

  if (req.method === "GET") {
    const val = await redis("GET", key);
    return res.status(200).json({ value: val ? JSON.parse(val) : null });
  }

  if (req.method === "POST") {
    const { value } = req.body;
    await redis("SET", key, JSON.stringify(value));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
