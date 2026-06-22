const http = require("http");
const Redis = require("ioredis");

const PORT = process.env.BACKEND_PORT || 3001;
const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  retryStrategy: (times) => Math.min(times * 200, 5000),
});

redis.on("connect", () => console.log("Connecte a Redis"));
redis.on("error", (err) => console.error("Erreur Redis :", err.message));

const TASKS_KEY = "taskflow:tasks";

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("JSON invalide"));
      }
    });
  });
}

async function getAllTasks() {
  const data = await redis.get(TASKS_KEY);
  return data ? JSON.parse(data) : [];
}

async function saveTasks(tasks) {
  await redis.set(TASKS_KEY, JSON.stringify(tasks));
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /health
  if (req.method === "GET" && req.url === "/health") {
    try {
      await redis.ping();
      res.writeHead(200);
      res.end(JSON.stringify({ status: "ok", redis: "connected" }));
    } catch {
      res.writeHead(503);
      res.end(JSON.stringify({ status: "error", redis: "disconnected" }));
    }
    return;
  }

  // GET /tasks
  if (req.method === "GET" && req.url === "/tasks") {
    try {
      const tasks = await getAllTasks();
      res.writeHead(200);
      res.end(JSON.stringify(tasks));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // POST /tasks
  if (req.method === "POST" && req.url === "/tasks") {
    try {
      const { titre } = await parseBody(req);
      if (!titre || !titre.trim()) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Le champ titre est requis" }));
        return;
      }
      const tasks = await getAllTasks();
      const task = {
        id: Date.now().toString(),
        titre: titre.trim(),
        done: false,
        created_at: new Date().toISOString(),
      };
      tasks.push(task);
      await saveTasks(tasks);
      res.writeHead(201);
      res.end(JSON.stringify(task));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // PUT /tasks/:id
  if (req.method === "PUT" && req.url.startsWith("/tasks/")) {
    try {
      const id = req.url.split("/")[2];
      const tasks = await getAllTasks();
      const task = tasks.find((t) => t.id === id);
      if (!task) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Tache introuvable" }));
        return;
      }
      task.done = !task.done;
      await saveTasks(tasks);
      res.writeHead(200);
      res.end(JSON.stringify(task));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // DELETE /tasks/:id
  if (req.method === "DELETE" && req.url.startsWith("/tasks/")) {
    try {
      const id = req.url.split("/")[2];
      let tasks = await getAllTasks();
      const index = tasks.findIndex((t) => t.id === id);
      if (index === -1) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Tache introuvable" }));
        return;
      }
      tasks.splice(index, 1);
      await saveTasks(tasks);
      res.writeHead(200);
      res.end(JSON.stringify({ deleted: true }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // GET /stats
  if (req.method === "GET" && req.url === "/stats") {
    try {
      const tasks = await getAllTasks();
      res.writeHead(200);
      res.end(
        JSON.stringify({
          total: tasks.length,
          done: tasks.filter((t) => t.done).length,
          pending: tasks.filter((t) => !t.done).length,
        })
      );
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Route introuvable" }));
});

server.listen(PORT, () => {
  console.log(`TaskFlow API demarree sur le port ${PORT}`);
});
