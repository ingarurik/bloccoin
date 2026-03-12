function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toHtmlMessage(data) {
  const pseudo = esc(data.pseudo);
  const email = esc(data.email);
  const categorie = esc(data.categorie);
  const objet = esc(data.objet);
  const message = esc(data.message).replace(/\n/g, "<br />");
  const capture = esc(data.capture || "Aucune");

  return `
  <div style="background:#060e1f;padding:24px;font-family:Georgia,'Times New Roman',serif;color:#e8dcc8;">
    <div style="max-width:760px;margin:0 auto;border:1px solid rgba(240,192,64,.28);background:linear-gradient(145deg, rgba(240,192,64,.08), rgba(8,16,30,.95) 35%, rgba(8,16,30,.98));padding:22px;">
      <div style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#f0c040;margin-bottom:10px;">Bloc-Coin</div>
      <h1 style="margin:0 0 8px;color:#ffe87a;font-size:28px;line-height:1.2;">Nouvelle demande Assistance</h1>
      <p style="margin:0 0 18px;color:#b7ab95;font-size:14px;line-height:1.6;">Message envoye depuis la page Assistance du site.</p>

      <div style="border:1px solid rgba(255,255,255,.12);padding:12px;background:rgba(5,10,20,.7);margin-bottom:8px;">
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#f0c040;margin-bottom:5px;">Pseudo Minecraft</div>
        <div style="font-size:16px;color:#f6eee1;">${pseudo}</div>
      </div>

      <div style="border:1px solid rgba(255,255,255,.12);padding:12px;background:rgba(5,10,20,.7);margin-bottom:8px;">
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#f0c040;margin-bottom:5px;">Email de reponse</div>
        <div style="font-size:16px;color:#f6eee1;">${email}</div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
        <div style="flex:1 1 220px;border:1px solid rgba(255,255,255,.12);padding:12px;background:rgba(5,10,20,.7);">
          <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#f0c040;margin-bottom:5px;">Categorie</div>
          <div style="font-size:15px;color:#f6eee1;">${categorie}</div>
        </div>
        <div style="flex:1 1 220px;border:1px solid rgba(255,255,255,.12);padding:12px;background:rgba(5,10,20,.7);">
          <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#f0c040;margin-bottom:5px;">Objet</div>
          <div style="font-size:15px;color:#f6eee1;">${objet}</div>
        </div>
      </div>

      <div style="border:1px solid rgba(255,255,255,.12);padding:12px;background:rgba(5,10,20,.7);margin-bottom:8px;">
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#f0c040;margin-bottom:5px;">Description</div>
        <div style="font-size:15px;color:#f6eee1;line-height:1.65;">${message}</div>
      </div>

      <div style="border:1px solid rgba(255,255,255,.12);padding:12px;background:rgba(5,10,20,.7);margin-bottom:8px;">
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#f0c040;margin-bottom:5px;">Lien capture</div>
        <div style="font-size:15px;color:#f6eee1;">${capture}</div>
      </div>

      <p style="margin:14px 0 0;color:#988c76;font-size:12px;">${new Date().toISOString()}</p>
    </div>
  </div>`;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.RESEND_API_KEY) {
    return Response.json({ ok: false, error: "missing_resend_key" }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const pseudo = String(body.pseudo || "").trim();
  const email = String(body.email || "").trim();
  const categorie = String(body.categorie || "").trim();
  const objet = String(body.objet || "").trim();
  const message = String(body.message || "").trim();
  const capture = String(body.capture || "").trim();

  if (!pseudo || !email || !categorie || !objet || !message) {
    return Response.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const html = toHtmlMessage({
    pseudo,
    email,
    categorie,
    objet,
    message,
    capture
  });

  const text = [
    "Bloc-Coin | Nouvelle demande Assistance",
    "",
    "Pseudo Minecraft: " + pseudo,
    "Email de reponse: " + email,
    "Categorie: " + categorie,
    "Objet: " + objet,
    "Description: " + message,
    "Capture: " + (capture || "Aucune")
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.SUPPORT_FROM || "Bloc-Coin <onboarding@resend.dev>",
      to: [env.SUPPORT_TO || "ingaruriksonic@gmail.com"],
      reply_to: email,
      subject: "[Assistance] " + categorie + " | " + objet,
      html,
      text
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    return Response.json({ ok: false, error: "provider_error", details: errBody }, { status: 502 });
  }

  const resendData = await response.json();
  return Response.json({ ok: true, id: resendData.id }, { status: 200 });
}
