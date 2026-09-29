// Keeps ONLY two running numbers. No response, IP, time or identity is ever stored.
import { getStore } from "@netlify/blobs";

const OPTIONS = ["acquisition", "account"];
const KEY = "tally";

export default async (req) => {
  const store = getStore({ name: "strength-survey", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const t = (await store.get(KEY, { type: "json" })) || { acquisition: 0, account: 0 };
    const total = t.acquisition + t.account;
    // Split is shown only with the private results key.
    const secret = Netlify.env.get("RESULTS_KEY");
    if (secret && url.searchParams.get("key") === secret) {
      return Response.json({ total, ...t }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ total }, { headers: { "Cache-Control": "no-store" } });
  }

  if (req.method === "POST") {
    let choice;
    try { ({ choice } = await req.json()); } catch { /* fall through */ }
    if (!OPTIONS.includes(choice)) return Response.json({ error: "bad choice" }, { status: 400 });

    // Safe increment: retry if two people submit at the same moment.
    for (let i = 0; i < 8; i++) {
      const cur = await store.getWithMetadata(KEY, { type: "json" });
      const t = cur?.data || { acquisition: 0, account: 0 };
      t[choice] += 1;
      const res = cur
        ? await store.setJSON(KEY, t, { onlyIfMatch: cur.etag })
        : await store.setJSON(KEY, t, { onlyIfNew: true });
      if (res.modified) return Response.json({ total: t.acquisition + t.account });
      await new Promise((r) => setTimeout(r, 40 + Math.random() * 120));
    }
    return Response.json({ error: "busy" }, { status: 503 });
  }

  return new Response("Method not allowed", { status: 405 });
};
