const http = require("http");
const { Client } = require("pg");

const PORT = process.env.PORT || 3000;

// Connexion à PostgreSQL via les variables d'environnement
const client = new Client({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function connectDB() {
  try {
    await client.connect();
    console.log("Connecté à PostgreSQL");

    // Créer la table si elle n'existe pas
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        texte TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("Table 'messages' prête");
  } catch (err) {
    console.error("Erreur connexion BDD :", err.message);
    process.exit(1);
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /messages — liste tous les messages
  if (req.method === "GET" && req.url === "/messages") {
    try {
      const result = await client.query(
        "SELECT * FROM messages ORDER BY created_at DESC"
      );
      res.writeHead(200);
      res.end(JSON.stringify(result.rows));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // POST /messages — ajouter un message
  if (req.method === "POST" && req.url === "/messages") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { texte } = JSON.parse(body);
        const result = await client.query(
          "INSERT INTO messages (texte) VALUES ($1) RETURNING *",
          [texte]
        );
        res.writeHead(201);
        res.end(JSON.stringify(result.rows[0]));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // GET /health — healthcheck de l'API
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Route introuvable" }));
});

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`API démarrée sur le port ${PORT}`);
  });
});
