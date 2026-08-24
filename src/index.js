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

    // Public: patient sends a message to the clinic
    if (path === "/api/messages" && request.method === "POST") {
      const body = await request.json();
      if (!body.uhid || !body.phone || !body.message) return json({ error: "uhid, phone and message required" }, 400);
      await env.DB.prepare(
        "INSERT INTO patient_messages (uhid, phone, patient_name, sender, message, read_by_admin, created_at) VALUES (?, ?, ?, 'patient', ?, 0, ?)"
      ).bind(body.uhid, body.phone, body.patient_name || "", body.message, Date.now()).run();

      // Fire a push notification to the admin (best-effort, never blocks the response)
      try {
        const { results: subs } = await env.DB.prepare("SELECT * FROM push_subscriptions").all();
        if (subs.length && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
          const payload = JSON.stringify({
            title: "New patient message",
            body: `${body.patient_name || "A patient"} (UHID: ${body.uhid}) sent a query.`,
            url: "/admin.html",
          });
          for (const sub of subs) {
            try {
              await sendWebPush(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payload,
                env.VAPID_PUBLIC_KEY,
                env.VAPID_PRIVATE_KEY
              );
            } catch (e) {
              if (e && (e.status === 404 || e.status === 410)) {
                await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(sub.id).run();
              }
            }
          }
        }
      } catch (e) {}

      return json({ ok: true });
    }

    // Public: patient fetches their own message thread
    if (path === "/api/messages/by-patient" && request.method === "GET") {
      const uhid = url.searchParams.get("uhid");
      const phone = (url.searchParams.get("phone") || "").replace(/\D/g, "").slice(-10);
      if (!uhid || !phone) return json({ error: "uhid and phone required" }, 400);
      const { results } = await env.DB.prepare(
        "SELECT id, sender, message, created_at FROM patient_messages WHERE uhid = ? AND phone LIKE ? ORDER BY created_at ASC"
      ).bind(uhid, "%" + phone).all();
      return json(results);
    }

    // Admin: list all conversations (grouped by uhid, latest message + unread count)
    if (path === "/api/admin/messages" && request.method === "GET") {
      const authErr = checkAuth(request, env);
      if (authErr) return authErr;
      const { results } = await env.DB.prepare(
        "SELECT * FROM patient_messages ORDER BY created_at ASC"
      ).all();
      const byUhid = {};
      for (const m of results) {
        if (!byUhid[m.uhid]) byUhid[m.uhid] = { uhid: m.uhid, phone: m.phone, patient_name: m.patient_name, messages: [], unread: 0 };
        byUhid[m.uhid].phone = m.phone || byUhid[m.uhid].phone;
        byUhid[m.uhid].patient_name = m.patient_name || byUhid[m.uhid].patient_name;
        byUhid[m.uhid].messages.push(m);
        if (m.sender === "patient" && !m.read_by_admin) byUhid[m.uhid].unread++;
      }
      const conversations = Object.values(byUhid).sort((a, b) => {
        const aLast = a.messages[a.messages.length - 1]?.created_at || 0;
        const bLast = b.messages[b.messages.length - 1]?.created_at || 0;
        return bLast - aLast;
      });
      return json(conversations);
    }

    // Admin: reply to a patient + mark thread read
    const msgReplyMatch = path.match(/^\/api\/admin\/messages\/([^/]+)$/);
    if (msgReplyMatch && request.method === "POST") {
      const authErr = checkAuth(request, env);
      if (authErr) return authErr;
      const uhid = decodeURIComponent(msgReplyMatch[1]);
      const body = await request.json();
      if (!body.message || !body.phone) return json({ error: "message and phone required" }, 400);
      await env.DB.prepare(
        "INSERT INTO patient_messages (uhid, phone, patient_name, sender, message, read_by_admin, created_at) VALUES (?, ?, ?, 'admin', ?, 1, ?)"
      ).bind(uhid, body.phone, body.patient_name || "", body.message, Date.now()).run();
      await env.DB.prepare(
        "UPDATE patient_messages SET read_by_admin = 1 WHERE uhid = ?"
      ).bind(uhid).run();
      return json({ ok: true });
    }

    // Admin: mark a conversation as read (without replying)
    if (msgReplyMatch && request.method === "PATCH") {
      const authErr = checkAuth(request, env);
      if (authErr) return authErr;
      const uhid = decodeURIComponent(msgReplyMatch[1]);
      await env.DB.prepare("UPDATE patient_messages SET read_by_admin = 1 WHERE uhid = ?").bind(uhid).run();
      return json({ ok: true });
    }

    // Admin: save a push notification subscription for this device
    if (path === "/api/push/subscribe" && request.method === "POST") {
      const authErr = checkAuth(request, env);
      if (authErr) return authErr;
      const body = await request.json();
      if (!body.endpoint || !body.keys) return json({ error: "invalid subscription" }, 400);
      await env.DB.prepare(
        "INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(endpoint) DO NOTHING"
      ).bind(body.endpoint, body.keys.p256dh, body.keys.auth, Date.now()).run();
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

/* ---------------------------------------------------------
   WEB PUSH — sends real push notifications using native
   Web Crypto (no external library). Implements RFC 8291
   (message encryption) and RFC 8292 (VAPID auth).
--------------------------------------------------------- */
function b64urlToBytes(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToB64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concatBytes(...arrs) {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

async function createVapidAuthHeader(audience, vapidPublicKeyB64, vapidPrivateKeyB64) {
  const pubBytes = b64urlToBytes(vapidPublicKeyB64); // 65 bytes: 0x04 || x(32) || y(32)
  const x = pubBytes.slice(1, 33), y = pubBytes.slice(33, 65);
  const d = b64urlToBytes(vapidPrivateKeyB64);
  const jwk = { kty: "EC", crv: "P-256", x: bytesToB64url(x), y: bytesToB64url(y), d: bytesToB64url(d), ext: true };
  const privateKey = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);

  const header = { typ: "JWT", alg: "ES256" };
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const claims = { aud: audience, exp, sub: "mailto:jkhospitalalld@gmail.com" };
  const enc = (obj) => bytesToB64url(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = enc(header) + "." + enc(claims);
  const sigRaw = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(unsigned)
  );
  const jwt = unsigned + "." + bytesToB64url(new Uint8Array(sigRaw));
  return `vapid t=${jwt}, k=${vapidPublicKeyB64}`;
}

async function encryptWebPushPayload(payloadStr, p256dhB64, authB64) {
  const asPublicBytes = b64urlToBytes(p256dhB64);
  const authSecret = b64urlToBytes(authB64);

  const asPublicKey = await crypto.subtle.importKey(
    "raw", asPublicBytes, { name: "ECDH", namedCurve: "P-256" }, false, []
  );
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
  );
  const localPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", localKeyPair.publicKey));

  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: asPublicKey }, localKeyPair.privateKey, 256
  );
  const ecdhSecret = new Uint8Array(sharedSecretBits);

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyInfo = concatBytes(
    new TextEncoder().encode("WebPush: info\0"), asPublicBytes, localPublicRaw
  );
  const ikmKey = await crypto.subtle.importKey("raw", ecdhSecret, "HKDF", false, ["deriveBits"]);
  const ikmBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: authSecret, info: keyInfo }, ikmKey, 256
  );
  const ikm = new Uint8Array(ikmBits);

  const prkKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const cekBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: cekInfo }, prkKey, 128
  );
  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");
  const nonceBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: nonceInfo }, prkKey, 96
  );
  const cek = new Uint8Array(cekBits);
  const nonce = new Uint8Array(nonceBits);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plaintext = concatBytes(new TextEncoder().encode(payloadStr), new Uint8Array([2])); // padding delimiter
  const encryptedBits = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext);
  const encrypted = new Uint8Array(encryptedBits);

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const idLen = new Uint8Array([localPublicRaw.length]);
  const header = concatBytes(salt, rs, idLen, localPublicRaw);
  return concatBytes(header, encrypted);
}

async function sendWebPush(subscription, payloadStr, vapidPublicKeyB64, vapidPrivateKeyB64) {
  const endpointUrl = new URL(subscription.endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
  const authHeader = await createVapidAuthHeader(audience, vapidPublicKeyB64, vapidPrivateKeyB64);
  const body = await encryptWebPushPayload(payloadStr, subscription.keys.p256dh, subscription.keys.auth);

  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "TTL": "86400",
      "Authorization": authHeader,
    },
    body,
  });
  if (!res.ok) {
    const err = new Error("Push failed: " + res.status);
    err.status = res.status;
    throw err;
  }
  return true;
}
