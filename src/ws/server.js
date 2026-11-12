import { WebSocket, WebSocketServer } from "ws";
import { wsArcjet } from "../arcjet.js";

const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_BUFFERED_AMOUNT = 1024 * 1024; // 1MB

const matchSubscribers = new Map();

function subscribe(matchId, socket) {
  if (!matchSubscribers.has(matchId)) {
    matchSubscribers.set(matchId, new Set());
  }

  matchSubscribers.get(matchId).add(socket);
}

function unsubscribe(matchId, socket) {
  const subscribers = matchSubscribers.get(matchId);

  if (!subscribers) return;

  subscribers.delete(socket);

  if (subscribers.size === 0) {
    matchSubscribers.delete(matchId);
  }
}

function cleanupSubscriptions(socket) {
  for (const matchId of socket.subscriptions) {
    unsubscribe(matchId, socket);
  }
}

function sendJson(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) return;

  socket.send(JSON.stringify(payload));
}

function broadcastToAll(wss, payload) {
  wss.clients.forEach((client) => {
    if (client.readyState !== WebSocket.OPEN) return;

    client.send(JSON.stringify(payload));
  });
}

function broadcastToMatch(matchId, payload) {
  const subscribers = matchSubscribers.get(matchId);

  if (!subscribers || subscribers.size === 0) return;

  const message = JSON.stringify(payload);

  for (const client of subscribers){
    if (client.readyState === WebSocket.OPEN) {
      if (client.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        cleanupSubscriptions(client);
        client.terminate();
        continue;
      }

      client.send(message);
    }
  }
}

function handleMessage(socket, data) {
  let message;

  try {
    message = JSON.parse(data.toString());
  } catch {
    sendJson(socket, { type: "error", message: "Invalid JSON" });
    return;
  }

  if (message === null || typeof message !== "object" || Array.isArray(message)) {
    sendJson(socket, { type: "error", message: "Invalid message" });
    return;
  }

  const isValidMatchId = Number.isInteger(message.matchId);

  if (message.type === "subscribe" && isValidMatchId) {
    subscribe(message.matchId, socket);
    socket.subscriptions.add(message.matchId);
    sendJson(socket, { type: "subscribed", matchId: message.matchId });

    return;
  }

  if (message.type === "unsubscribe" && isValidMatchId) {
    unsubscribe(message.matchId, socket);
    socket.subscriptions.delete(message.matchId);
    sendJson(socket, { type: "unsubscribed", matchId: message.matchId });

    return;
  }
}


export default function attachWebSocketServer(server) {
  const wss = new WebSocketServer({
    noServer: true,
    path: "/ws",
    maxPayload: 1024 * 1024, // 1MB
  });

  wss.on("error", console.error);

  server.on("upgrade", async (req, socket, head) => {
    const onSocketError = (error) => {
      console.error("WS upgrade socket error", error);
      socket.destroy();
    };
    socket.on("error", onSocketError);

    const rejectUpgrade = (status, reason) => {
      socket.once("finish", () => socket.destroy());
      socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    };

    if (!wss.shouldHandle(req)) {
      rejectUpgrade(404, "Not Found");
      return;
    }

    try {
      if (wsArcjet) {
        const decision = await wsArcjet.protect(req);

        if (socket.destroyed || !socket.readable || !socket.writable) return;

        if (decision.isDenied()) {
          if (decision.reason.isRateLimit()) {
            rejectUpgrade(429, "Too Many Requests");
          } else {
            rejectUpgrade(403, "Forbidden");
          }
          return;
        }
      }

      if (socket.destroyed || !socket.readable || !socket.writable) return;

      wss.handleUpgrade(req, socket, head, (ws) => {
        socket.removeListener("error", onSocketError);
        wss.emit("connection", ws, req);
      });
    } catch (error) {
      console.error("WS upgrade error", error);
      if (!socket.destroyed) rejectUpgrade(503, "Service Unavailable");
    }
  });

  server.on("close", () => wss.close());

  wss.on('connection', (socket) => {
    socket.isAlive = true;
    socket.subscriptions = new Set();

    socket.on("error", () => {
      socket.terminate();
    });

    socket.on("close", () => {
      cleanupSubscriptions(socket);
    });

    socket.on("error", console.error);

    socket.on("pong", () => {
      socket.isAlive = true;
    });

    socket.on("message", (data ) => {
      handleMessage(socket, data);
    });

    sendJson(socket, { type: "welcome" });
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
    broadcastToAll(wss, { type: "match_created", data: match });
  }

  function broadcastCommentary(matchId, comment) {
    broadcastToMatch(matchId, { type: "commentary", data: comment });
  }

  return { 
    broadcastMatchCreated, 
    broadcastCommentary 
  }
}
