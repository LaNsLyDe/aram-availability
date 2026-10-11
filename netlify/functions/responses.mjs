import { getStore } from "@netlify/blobs";

// Allowed values. Anything else sent by a browser is ignored.
const DAYS = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"];
const TIMES = ["morning", "afternoon", "evening"];
const LOCS = ["makati", "eastwood"];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const clean = (arr, allowed) =>
  Array.isArray(arr) ? [...new Set(arr)].filter((x) => allowed.includes(x)) : [];

export default async (req) => {
  const store = getStore("aram-responses");

  // List all responses. The owner token is never returned.
  if (req.method === "GET") {
    const { blobs } = await store.list();
    const rows = await Promise.all(
      blobs.map(async (b) => {
        const r = await store.get(b.key, { type: "json" });
        return r ? { id: b.key, name: r.name, days: r.days, times: r.times, locs: r.locs } : null;
      })
    );
    return json({ responses: rows.filter(Boolean) });
  }

  // Create or update a response. Updates need the token saved with the response.
  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad_request" }, 400);
    }

    const token = typeof body.token === "string" ? body.token : "";
    if (token.length < 16 || token.length > 100) return json({ error: "bad_request" }, 400);

    const payload = {
      name: String(body.name || "").trim().slice(0, 40),
      days: clean(body.days, DAYS),
      times: clean(body.times, TIMES),
      locs: clean(body.locs, LOCS),
    };
    if (!payload.days.length || !payload.times.length || !payload.locs.length) {
      return json({ error: "incomplete" }, 400);
    }

    let id = typeof body.id === "string" && /^[a-f0-9-]{36}$/.test(body.id) ? body.id : null;
    if (id) {
      const existing = await store.get(id, { type: "json" });
      if (!existing) return json({ error: "not_found" }, 404);
      if (existing.token !== token) return json({ error: "forbidden" }, 403);
    } else {
      id = crypto.randomUUID();
    }

    await store.setJSON(id, { ...payload, token, updated: Date.now() });
    return json({ id });
  }

  // Remove a response. Same token check as updates.
  if (req.method === "DELETE") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad_request" }, 400);
    }
    const id = typeof body.id === "string" ? body.id : "";
    const token = typeof body.token === "string" ? body.token : "";
    const existing = await store.get(id, { type: "json" });
    if (!existing) return json({ error: "not_found" }, 404);
    if (existing.token !== token) return json({ error: "forbidden" }, 403);
    await store.delete(id);
    return json({ ok: true });
  }

  return json({ error: "method_not_allowed" }, 405);
};

export const config = { path: "/api/responses" };
