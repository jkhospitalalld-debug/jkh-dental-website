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

    // Public: list videos
    if (path === "/api/videos" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT id, youtube_id, title FROM videos ORDER BY created_at DESC"
      ).all();
      return json(results);
    }

    // Admin: list videos
    if (path === "/api/admin/videos" && request.method === "GET") {
      const authErr = checkAuth(request, env);
      if (authErr) return authErr;
      const { results } = await env.DB.prepare(
        "SELECT id, youtube_id, title FROM videos ORDER BY created_at DESC"
      ).all();
      return json(results);
    }

    // Admin: add video
    if (path === "/api/admin/videos" && request.method === "POST") {
      const authErr = checkAuth(request, env);
      if (authErr) return authErr;
      const body = await request.json();
      if (!body.youtube_id) return json({ error: "youtube_id required" }, 400);
      await env.DB.prepare(
        "INSERT INTO videos (youtube_id, title, created_at) VALUES (?, ?, ?)"
      ).bind(body.youtube_id, body.title || "", Date.now()).run();
      return json({ ok: true });
    }

    // Admin: delete video
    const videoMatch = path.match(/^\/api\/admin\/videos\/(\d+)$/);
    if (videoMatch && request.method === "DELETE") {
      const authErr = checkAuth(request, env);
      if (authErr) return authErr;
      await env.DB.prepare("DELETE FROM videos WHERE id = ?").bind(videoMatch[1]).run();
      return json({ ok: true });
    }

    // Public: check booked time slots for a date (no personal info exposed)
    if (path === "/api/appointments/by-date" && request.method === "GET") {
      const date = url.searchParams.get("date");
      if (!date) return json({ error: "date required" }, 400);
      const { results } = await env.DB.prepare(
        "SELECT pref_time FROM appointments WHERE pref_date = ? AND status != 'cancelled' ORDER BY pref_time ASC"
      ).bind(date).all();
      return json(results.map(r => r.pref_time).filter(Boolean));
    }

    // Public: patient looks up their own appointments by phone
    if (path === "/api/appointments/by-phone" && request.method === "GET") {
      const phone = (url.searchParams.get("phone") || "").replace(/\D/g, "").slice(-10);
      if (!phone) return json({ error: "phone required" }, 400);
      const { results } = await env.DB.prepare(
        "SELECT id, service, pref_date, pref_time, status, created_at FROM appointments WHERE phone LIKE ? ORDER BY created_at DESC"
      ).bind("%" + phone).all();
      return json(results);
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

    // Admin: get notes for an appointment
    const notesMatch = path.match(/^\/api\/admin\/appointments\/(\d+)\/notes$/);
    if (notesMatch && request.method === "GET") {
      const authErr = checkAuth(request, env);
      if (authErr) return authErr;
      const { results } = await env.DB.prepare(
        "SELECT * FROM appointment_notes WHERE appointment_id = ? ORDER BY created_at ASC"
      ).bind(notesMatch[1]).all();
      return json(results);
    }

    // Admin: add a note for an appointment
    if (notesMatch && request.method === "POST") {
      const authErr = checkAuth(request, env);
      if (authErr) return authErr;
      const body = await request.json();
      if (!body.note) return json({ error: "note required" }, 400);
      await env.DB.prepare(
        "INSERT INTO appointment_notes (appointment_id, note, created_at) VALUES (?, ?, ?)"
      ).bind(notesMatch[1], body.note, Date.now()).run();
      return json({ ok: true });
    }


    // Public: list active FAQ questions and answers
    if (path === "/api/faqs" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare(
          "SELECT id, question, answer, category, display_order FROM faqs WHERE active = 1 ORDER BY display_order ASC, id ASC"
        ).all();
        return json(results);
      } catch (err) {
        // Keeps the website working if the FAQ table has not been created yet.
        return json({ error: "FAQ system is not configured yet." }, 503);
      }
    }

    // Admin: list all FAQs
    if (path === "/api/admin/faqs" && request.method === "GET") {
      const authErr = checkAuth(request, env);
      if (authErr) return authErr;
      try {
        const { results } = await env.DB.prepare(
          "SELECT id, question, answer, category, active, display_order, created_at, updated_at FROM faqs ORDER BY display_order ASC, id ASC"
        ).all();
        return json(results);
      } catch (err) {
        return json({ error: "FAQ table not found. Create the faqs table first." }, 503);
      }
    }

    // Admin: add FAQ
    if (path === "/api/admin/faqs" && request.method === "POST") {
      const authErr = checkAuth(request, env);
      if (authErr) return authErr;
      const body = await request.json();
      if (!body.question || !body.answer) {
        return json({ error: "question and answer required" }, 400);
      }
      const now = Date.now();
      try {
        await env.DB.prepare(
          "INSERT INTO faqs (question, answer, category, active, display_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          body.question.trim(),
          body.answer.trim(),
          (body.category || "General").trim(),
          body.active === false ? 0 : 1,
          Number.isFinite(Number(body.display_order)) ? Number(body.display_order) : 0,
          now,
          now
        ).run();
        return json({ ok: true });
      } catch (err) {
        return json({ error: "Could not save FAQ. Make sure the faqs table exists." }, 503);
      }
    }

    // Admin: update FAQ
    const faqMatch = path.match(/^\/api\/admin\/faqs\/(\d+)$/);
    if (faqMatch && request.method === "PATCH") {
      const authErr = checkAuth(request, env);
      if (authErr) return authErr;
      const body = await request.json();
      if (!body.question || !body.answer) {
        return json({ error: "question and answer required" }, 400);
      }
      try {
        await env.DB.prepare(
          "UPDATE faqs SET question = ?, answer = ?, category = ?, active = ?, display_order = ?, updated_at = ? WHERE id = ?"
        ).bind(
          body.question.trim(),
          body.answer.trim(),
          (body.category || "General").trim(),
          body.active === false ? 0 : 1,
          Number.isFinite(Number(body.display_order)) ? Number(body.display_order) : 0,
          Date.now(),
          faqMatch[1]
        ).run();
        return json({ ok: true });
      } catch (err) {
        return json({ error: "Could not update FAQ." }, 503);
      }
    }

    // Admin: delete FAQ
    if (faqMatch && request.method === "DELETE") {
      const authErr = checkAuth(request, env);
      if (authErr) return authErr;
      try {
        await env.DB.prepare("DELETE FROM faqs WHERE id = ?").bind(faqMatch[1]).run();
        return json({ ok: true });
      } catch (err) {
        return json({ error: "Could not delete FAQ." }, 503);
      }
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
