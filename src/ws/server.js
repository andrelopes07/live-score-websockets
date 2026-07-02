import {WebSocket, WebSocketServer} from "ws";
import {wsArcjet} from "../arcjet.js";

const HEARTBEAT_INTERVAL_MS = 30_000;

function sendJson(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) return;

  socket.send(JSON.stringify(payload));
}

function broadcast(wss, payload) {
  wss.clients.forEach((client) => {
    if (client.readyState !== WebSocket.OPEN) return;

    client.send(JSON.stringify(payload));
  });
}

export default function attachWebSocketServer(server) {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: 1024 * 1024, // 1MB
  });

  wss.on("error", console.error);

  wss.on('connection', async (socket, req) => {
    if (wsArcjet) {
      try {
        const decision = await wsArcjet.protect(req);

        if (decision.isDenied()) {
          const code = decision.reason.isRateLimit() ? 1013 : 1008;
          const reason = decision.reason.isRateLimit() ? "Rate limit exceeded" : "Access denied";

          socket.close(code, reason);
          return;
        }

      } catch (e) {
        console.error("WS connection error", e);
        socket.close(1011, "Server security error");
        return;
      }
    }

    socket.isAlive = true;

    sendJson(socket, { type: "welcome" });

    socket.on("error", console.error);

    socket.on("pong", () => {
      socket.isAlive = true;
    });
  });

  const heartbeat = setInterval(() => {
    wss.clients.forEach((socket) => {
      if (socket.isAlive === false) return socket.terminate();

      socket.isAlive = false;
      socket.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => clearInterval(heartbeat));

  function broadcastMatchCreated(match) {
    broadcast(wss, { type: "match_created", data: match });
  }

  return { broadcastMatchCreated }
}
