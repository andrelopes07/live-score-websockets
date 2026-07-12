import express from "express";
import { matchRouter } from "./routes/matches.js";
import http from "http";
import attachWebSocketServer from "./ws/server.js";
import { securityMiddleware } from "./arcjet.js";

const app = express();
const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || "0.0.0.0";

app.use(express.json());
const server = http.createServer(app);

app.use(securityMiddleware());

app.get("/", (req, res) => {
  res.json({ message: "Live Score Demo API is running" });
});

app.use("/matches", matchRouter);

const { broadcastMatchCreated } = attachWebSocketServer(server);
app.locals.broadcastMatchCreated = broadcastMatchCreated;

server.listen(PORT, HOST, () => {
  const baseUrl = HOST === "0.0.0.0" ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
  console.log(`Server running at ${baseUrl}`);
  console.log(`WebSocket Server running at ${baseUrl.replace("http", "ws")}/ws`);
});
