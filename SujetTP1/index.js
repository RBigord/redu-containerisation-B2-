const http = require("http");
const fs   = require("fs");
const path = require("path");

const PORT      = process.env.PORT || 3000;
const DATA_DIR  = "/app/data";
const DATA_FILE = path.join(DATA_DIR, "messages.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function lireMessages() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function ajouterMessage(texte) {
  const messages = lireMessages();
  messages.push({ texte, date: new Date().toLocaleString("fr-FR") });
  fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2));
}

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  if (req.method === "POST" && req.url === "/ajouter") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      ajouterMessage(params.get("message") || "(vide)");
      res.writeHead(302, { Location: "/" });
      res.end();
    });
    return;
  }

  if (req.url === "/") {
    const messages = lireMessages();
    const liste = messages.length === 0
      ? `<p style="color:#888">Aucun message pour l'instant.</p>`
      : messages.map((m) =>
          `<li><strong>${m.texte}</strong> <span style="color:#888;font-size:0.85em">(${m.date})</span></li>`
        ).join("");

    res.writeHead(200);
    res.end(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>TP1 Docker</title>
  <style>
    body   { font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; }
    h1     { color: #1a73e8; }
    form   { display: flex; gap: 8px; margin: 20px 0; }
    input  { flex: 1; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 1em; }
    button { padding: 8px 18px; background: #1a73e8; color: white; border: none; border-radius: 4px; cursor: pointer; }
    ul     { list-style: none; padding: 0; }
    li     { padding: 8px 12px; border-left: 3px solid #1a73e8; margin-bottom: 8px; background: #f8f9ff; }
  </style>
</head>
<body>
  <h1>🐳 TP1 — Image Docker</h1>
  <form method="POST" action="/ajouter">
    <input name="message" placeholder="Tape un message..." autofocus />
    <button type="submit">Envoyer</button>
  </form>
  <h2>Messages (${messages.length})</h2>
  <ul>${liste}</ul>
  <p style="color:#888;font-size:0.85em">Container : ${process.env.HOSTNAME || "inconnu"}</p>
</body>
</html>`);
    return;
  }

  res.writeHead(404);
  res.end("<h1>404</h1>");
});

server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
