import { getStore } from "@netlify/blobs";

const MAX_BYTES = 4 * 1024 * 1024; // batas Netlify Functions ~6MB (base64 menambah ~33%)
const ALLOWED = {
  "image/jpeg": 1, "image/png": 1, "image/webp": 1, "image/gif": 1,
  "video/mp4": 1, "video/webm": 1
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  const store = getStore("galeri-osis");
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  try {
    if (req.method === "GET" && id) {
      if (!/^[\w-]{5,60}$/.test(id)) return json({ error: "ID tidak valid" }, 400);
      const r = await store.getWithMetadata(id, { type: "arrayBuffer" });
      if (!r) return json({ error: "Tidak ditemukan" }, 404);
      return new Response(r.data, {
        headers: {
          "content-type": r.metadata.type || "application/octet-stream",
          "cache-control": "public, max-age=31536000, immutable",
          "x-content-type-options": "nosniff"
        }
      });
    }

    if (req.method === "GET") {
      const { blobs } = await store.list();
      const items = (await Promise.all(blobs.map(async (b) => {
        const m = await store.getMetadata(b.key);
        if (!m) return null;
        const md = m.metadata || {};
        return { id: b.key, name: md.name, caption: md.caption, type: md.type, ts: md.ts };
      }))).filter(Boolean).sort((a, b) => b.ts - a.ts);
      return json({ items });
    }

    if (req.method === "POST") {
      let body;
      try { body = await req.json(); } catch { return json({ error: "Data tidak valid" }, 400); }
      const name = String(body.name || "").trim().slice(0, 40);
      const caption = String(body.caption || "").trim().slice(0, 120);
      const type = String(body.type || "");
      const b64 = String(body.data || "");
      if (!name) return json({ error: "Nama wajib diisi" }, 400);
      if (!ALLOWED[type]) return json({ error: "Jenis file tidak didukung (foto/video saja)" }, 400);
      const buf = Buffer.from(b64, "base64");
      if (!buf.length) return json({ error: "File kosong" }, 400);
      if (buf.length > MAX_BYTES) return json({ error: "File terlalu besar (maks 4 MB)" }, 413);
      const key = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
      await store.set(key, buf, { metadata: { name, caption, type, ts: Date.now() } });
      return json({ ok: true, id: key }, 201);
    }

    if (req.method === "DELETE") {
      const admin = Netlify.env.get("ADMIN_KEY");
      if (!admin || req.headers.get("x-admin-key") !== admin) return json({ error: "Tidak diizinkan" }, 403);
      if (!id || !/^[\w-]{5,60}$/.test(id)) return json({ error: "ID tidak valid" }, 400);
      await store.delete(id);
      return json({ ok: true });
    }

    return json({ error: "Metode tidak didukung" }, 405);
  } catch (e) {
    return json({ error: "Server error: " + (e && e.message || e) }, 500);
  }
};

export const config = { path: "/api/gallery" };
