import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import type { Server, IncomingMessage } from "http";

interface SessionClient {
  ws: WebSocket;
  userId: number;
  username: string;
  sessionId: number;
}

interface RoomState {
  clients: Set<SessionClient>;
  whiteboardActions: any[];
  textbook: { textbookId: number; title: string; page: number } | null;
}

type WSMessage =
  | { type: "join"; sessionId: number; userId: number; username: string }
  | { type: "leave" }
  | { type: "webrtc-offer"; sdp: any; toUserId?: number }
  | { type: "webrtc-answer"; sdp: any; toUserId?: number }
  | { type: "webrtc-ice"; candidate: any; toUserId?: number }
  | { type: "whiteboard-action"; action: any }
  | { type: "whiteboard-clear" }
  | { type: "whiteboard-undo" }
  | { type: "whiteboard-update-image"; id: string; x1: number; y1: number; imageWidth: number; imageHeight: number }
  | { type: "textbook-sync"; textbookId: number; page: number }
  | { type: "textbook-open"; textbookId: number; title: string }
  | { type: "chat-message"; content: string }
  | { type: "cursor-move"; x: number; y: number; tool: string }
  | { type: "presence-check" }
  | { type: "audio-mime"; mimeType: string }
  | { type: "audio-stopped" };

const rooms = new Map<number, RoomState>();

function getOrCreateRoom(sessionId: number): RoomState {
  if (!rooms.has(sessionId)) {
    rooms.set(sessionId, { clients: new Set(), whiteboardActions: [], textbook: null });
  }
  return rooms.get(sessionId)!;
}

function broadcastToRoom(sessionId: number, message: any, excludeUserId?: number) {
  const room = rooms.get(sessionId);
  if (!room) return;
  const data = JSON.stringify(message);
  for (const client of room.clients) {
    if (excludeUserId !== undefined && client.userId === excludeUserId) continue;
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  }
}

function sendToUser(sessionId: number, targetUserId: number, message: any) {
  const room = rooms.get(sessionId);
  if (!room) return;
  const data = JSON.stringify(message);
  for (const client of room.clients) {
    if (client.userId === targetUserId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
      return;
    }
  }
}

function getRoomPresence(sessionId: number): { userId: number; username: string }[] {
  const room = rooms.get(sessionId);
  if (!room) return [];
  return Array.from(room.clients).map(c => ({ userId: c.userId, username: c.username }));
}

export function setupSessionWebSocket(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  const HEARTBEAT_INTERVAL = 25_000;
  const CLIENT_TIMEOUT = 50_000;
  const aliveMap = new WeakMap<WebSocket, number>();

  const heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const ws of wss.clients) {
      const lastPong = aliveMap.get(ws) ?? 0;
      if (now - lastPong > CLIENT_TIMEOUT) {
        console.log("[SessionWS] Terminating stale connection (no pong)");
        ws.terminate();
        continue;
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }
  }, HEARTBEAT_INTERVAL);

  wss.on("close", () => clearInterval(heartbeatTimer));

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    let client: SessionClient | null = null;
    aliveMap.set(ws, Date.now());
    ws.on("pong", () => aliveMap.set(ws, Date.now()));

    ws.on("message", (raw, isBinary) => {
      aliveMap.set(ws, Date.now());
      // Binary = audio chunk from MediaRecorder, relay to all other room members
      if (isBinary) {
        if (!client) return;
        const room = rooms.get(client.sessionId);
        if (!room) return;
        for (const c of room.clients) {
          if (c.userId !== client.userId && c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(raw, { binary: true });
          }
        }
        return;
      }

      try {
        const msg: WSMessage = JSON.parse(raw.toString());

        if (msg.type === "ping") {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "pong" }));
          return;
        }

        if (msg.type === "join") {
          const room = getOrCreateRoom(msg.sessionId);

          const stale: SessionClient[] = [];
          for (const c of room.clients) {
            if (c.userId === msg.userId && c.ws !== ws) {
              stale.push(c);
            }
          }
          for (const c of stale) {
            room.clients.delete(c);
            try { c.ws.terminate(); } catch {}
            console.log(`[SessionWS] Removed stale connection for user ${c.username} (id=${c.userId})`);
          }

          client = { ws, userId: msg.userId, username: msg.username, sessionId: msg.sessionId };
          room.clients.add(client);
          console.log(`[SessionWS] User ${msg.username} joined session ${msg.sessionId}`);

          broadcastToRoom(msg.sessionId, {
            type: "user-joined",
            userId: msg.userId,
            username: msg.username,
            participants: getRoomPresence(msg.sessionId),
          });

          ws.send(JSON.stringify({
            type: "room-state",
            whiteboardActions: room.whiteboardActions,
            textbook: room.textbook,
            participants: getRoomPresence(msg.sessionId),
          }));
          return;
        }

        if (!client) return;

        switch (msg.type) {
          case "audio-mime":
          case "audio-stopped":
            broadcastToRoom(client.sessionId, { ...(msg as any), fromUserId: client.userId }, client.userId);
            break;

          case "webrtc-offer":
          case "webrtc-answer":
          case "webrtc-ice":
            if (msg.toUserId) {
              sendToUser(client.sessionId, msg.toUserId, {
                ...msg,
                fromUserId: client.userId,
                fromUsername: client.username,
              });
            } else {
              broadcastToRoom(client.sessionId, {
                ...msg,
                fromUserId: client.userId,
                fromUsername: client.username,
              }, client.userId);
            }
            break;

          case "draw-stream": {
            broadcastToRoom(client.sessionId, {
              type: "draw-stream",
              strokeId: msg.strokeId,
              points: msg.points,
              tool: msg.tool,
              color: msg.color,
              lineWidth: msg.lineWidth,
              fromUserId: client.userId,
            }, client.userId);
            break;
          }

          case "draw-end": {
            broadcastToRoom(client.sessionId, {
              type: "draw-end",
              strokeId: msg.strokeId,
              fromUserId: client.userId,
            }, client.userId);
            break;
          }

          case "whiteboard-action": {
            const room = rooms.get(client.sessionId);
            if (room) {
              room.whiteboardActions.push(msg.action);
            }
            broadcastToRoom(client.sessionId, {
              type: "whiteboard-action",
              action: msg.action,
              fromUserId: client.userId,
            }, client.userId);
            break;
          }

          case "whiteboard-clear": {
            const room = rooms.get(client.sessionId);
            if (room) {
              room.whiteboardActions = [];
            }
            broadcastToRoom(client.sessionId, {
              type: "whiteboard-clear",
              fromUserId: client.userId,
            }, client.userId);
            break;
          }

          case "whiteboard-undo": {
            const room = rooms.get(client.sessionId);
            if (room && room.whiteboardActions.length > 0) {
              room.whiteboardActions.pop();
            }
            broadcastToRoom(client.sessionId, {
              type: "whiteboard-undo",
              fromUserId: client.userId,
            }, client.userId);
            break;
          }

          case "whiteboard-update-image": {
            const room = rooms.get(client.sessionId);
            if (room) {
              const action = room.whiteboardActions.find((a: any) => a.id === (msg as any).id);
              if (action) {
                action.x1 = (msg as any).x1; action.y1 = (msg as any).y1;
                action.imageWidth = (msg as any).imageWidth; action.imageHeight = (msg as any).imageHeight;
                action.startX = (msg as any).x1; action.startY = (msg as any).y1;
              }
            }
            broadcastToRoom(client.sessionId, {
              type: "whiteboard-update-image",
              ...(msg as any),
              fromUserId: client.userId,
            }, client.userId);
            break;
          }

          case "textbook-sync": {
            const room = rooms.get(client.sessionId);
            if (room && room.textbook) {
              room.textbook.page = msg.page;
            }
            broadcastToRoom(client.sessionId, {
              type: "textbook-sync",
              textbookId: msg.textbookId,
              page: msg.page,
              fromUserId: client.userId,
            }, client.userId);
            break;
          }

          case "textbook-open": {
            const room = rooms.get(client.sessionId);
            if (room) {
              room.textbook = { textbookId: msg.textbookId, title: msg.title, page: 1 };
            }
            broadcastToRoom(client.sessionId, {
              type: "textbook-open",
              textbookId: msg.textbookId,
              title: msg.title,
              fromUserId: client.userId,
            }, client.userId);
            break;
          }

          case "chat-message":
            broadcastToRoom(client.sessionId, {
              type: "chat-message",
              userId: client.userId,
              username: client.username,
              content: msg.content,
              timestamp: Date.now(),
            }, client.userId);
            break;

          case "cursor-move":
            broadcastToRoom(client.sessionId, {
              type: "cursor-move",
              x: msg.x,
              y: msg.y,
              tool: msg.tool,
              fromUserId: client.userId,
              fromUsername: client.username,
            }, client.userId);
            break;

          case "presence-check":
            ws.send(JSON.stringify({
              type: "presence",
              participants: getRoomPresence(client.sessionId),
            }));
            break;
        }
      } catch (err) {
        console.error("[SessionWS] Error parsing message:", err);
      }
    });

    ws.on("close", () => {
      if (client) {
        const room = rooms.get(client.sessionId);
        if (room) {
          room.clients.delete(client);
          const wasInRoom = room.clients.has(client);
          room.clients.delete(client);
          if (!wasInRoom) {
            console.log(`[SessionWS] Stale connection closed for user ${client.username} (id=${client.userId}) — suppressing user-left`);
            return;
          }
          if (room.clients.size === 0) {
            rooms.delete(client.sessionId);
          } else {
            broadcastToRoom(client.sessionId, {
              type: "user-left",
              userId: client.userId,
              username: client.username,
              participants: getRoomPresence(client.sessionId),
            });
          }
        }
        console.log(`[SessionWS] User ${client.username} left session ${client.sessionId}`);
      }
    });

    ws.on("error", (err) => {
      console.error("[SessionWS] WebSocket error:", err);
    });
  });

  console.log("[SessionWS] WebSocket server initialized on /ws/session");
  return wss;
}
