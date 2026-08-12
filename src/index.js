export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Public: list all case photos
    if (path === "/api/cases" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT id, image, label FROM case_photos ORDER BY created_at DESC"
      ).all();
      return json(results);
    }

    // Admin: list all case photos (auth required, same data but explicit admin route)
    if (path === "/api/admin/cases" && request.method === "GET") {
      const authErr = checkAuth(request, env);
      if (authErr) return authErr;
      const { results } = await env.DB.prepare(
        "SELECT id, image, label FROM case_photos ORDER BY created_at DESC"
      ).all();
      return json(results);
    }

    // Admin: add a new case photo
    if (path === "/api/admin/cases" && request.method === "POST") {
      const authErr = checkAuth(request, env);
      if (authErr) return authErr;
      const body = await request.json();
      if (!body.image) return json({ error: "image required" }, 400);
      await env.DB.prepare(
        "INSERT INTO case_photos (image, label, created_at) VALUES (?, ?, ?)"
      ).bind(body.image, body.label || "", Date.now()).run();
      return json({ ok: true });
    }

    // Admin: delete a case photo
    const delMatch = path.match(/^\/api\/admin\/cases\/(\d+)$/);
    if (delMatch && request.method === "DELETE") {
      const authErr = checkAuth(request, env);
      if (authErr) return authErr;
      await env.DB.prepare("DELETE FROM case_photos WHERE id = ?").bind(delMatch[1]).run();
      return json({ ok: true });
    }

    // Everything else -> static assets (index.html, admin.html, assets/*)
    return env.ASSETS.fetch(request);
  },
};

function checkAuth(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "");
  if (token !== env.ADMIN_PASSWORD) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
