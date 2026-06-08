const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "rakukyu:companies";
const headers = { Authorization: `Bearer ${REDIS_TOKEN}` };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // GET
  if (req.method === "GET") {
    const r = await fetch(`${REDIS_URL}/get/${encodeURIComponent(KEY)}`, { headers });
    const { result } = await r.json();
    if (!result) return res.status(200).json({ value: null });
    try {
      return res.status(200).json({ value: JSON.parse(result) });
    } catch {
      return res.status(200).json({ value: result });
    }
  }

  // POST - pipeline方式
  if (req.method === "POST") {
    let raw = "";
    for await (const chunk of req) raw += chunk;

    let companies;
    try {
      companies = JSON.parse(raw).companies;
    } catch {
      return res.status(400).json({ error: "invalid body" });
    }

    const r = await fetch(`${REDIS_URL}/pipeline`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["SET", KEY, JSON.stringify(companies)]
      ]),
    });
    const result = await r.json();
    return res.status(200).json({ ok: true, result });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
