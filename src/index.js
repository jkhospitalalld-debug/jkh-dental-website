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
      if (body.image.length > 1800000) {
        return json({ error: "Image too large. Please use a smaller photo." }, 413);
      }
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

    // Public: submit a new appointment request
    if (path === "/api/appointments" && request.method === "POST") {
      const body = await request.json();
      if (!body.name || !body.phone) return json({ error: "name and phone required" }, 400);
      await env.DB.prepare(
        `INSERT INTO appointments (name, phone, patient_type, service, pref_date, pref_time, message, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      ).bind(
        body.name, body.phone, body.patientType || "", body.service || "",
        body.date || "", body.time || "", body.message || "", Date.now()
      ).run();
      return json({ ok: true });
    }

    // Admin: list all appointments
    if (path === "/api/admin/appointments" && request.method === "GET") {
      const authErr = checkAuth(request, env);
      if (authErr) return authErr;
      const { results } = await env.DB.prepare(
        "SELECT * FROM appointments ORDER BY created_at DESC"
      ).all();
      return json(results);
    }

    // Admin: update appointment status
    const statusMatch = path.match(/^\/api\/admin\/appointments\/(\d+)$/);
    if (statusMatch && request.method === "PATCH") {
      const authErr = checkAuth(request, env);
      if (authErr) return authErr;
      const body = await request.json();
      await env.DB.prepare("UPDATE appointments SET status = ? WHERE id = ?")
        .bind(body.status, statusMatch[1]).run();
      return json({ ok: true });
    }

    // Admin: delete appointment
    if (statusMatch && request.method === "DELETE") {
      const authErr = checkAuth(request, env);
      if (authErr) return authErr;
      await env.DB.prepare("DELETE FROM appointments WHERE id = ?").bind(statusMatch[1]).run();
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
