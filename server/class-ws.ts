import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { storage } from "./storage";

interface ClassClient {
  ws: WebSocket;
  userId: number;
  username: string;
  classId: number;
  role: string;
}

interface ClassRoom {
  clients: Set<ClassClient>;
  whiteboardActions: any[];
  micActiveUserId?: number;
}

const rooms = new Map<number, ClassRoom>();

function getOrCreateRoom(classId: number): ClassRoom {
  if (!rooms.has(classId)) {
    rooms.set(classId, { clients: new Set(), whiteboardActions: [] });
  }
  return rooms.get(classId)!;
}

function broadcastToRoom(classId: number, message: any, excludeUserId?: number) {
  const room = rooms.get(classId);
  if (!room) return;
  const data = JSON.stringify(message);
  let sentCount = 0;
  let skippedCount = 0;
  for (const client of room.clients) {
    if (excludeUserId !== undefined && client.userId === excludeUserId) { skippedCount++; continue; }
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
      sentCount++;
    } else {
      skippedCount++;
    }
  }
  if (message.type === "whiteboard-action" || message.type === "whiteboard-clear" || message.type === "whiteboard-undo") {
    console.log(`[ClassWS] broadcast ${message.type} to room ${classId}: sent=${sentCount}, skipped=${skippedCount} (total clients: ${room.clients.size})`);
  }
}

function sendToUser(classId: number, targetUserId: number, message: any) {
  const room = rooms.get(classId);
  if (!room) return;
  const data = JSON.stringify(message);
  for (const client of room.clients) {
    if (client.userId === targetUserId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
      break;
    }
  }
}

function getRoomParticipants(classId: number) {
  const room = rooms.get(classId);
  if (!room) return [];
  return Array.from(room.clients).map(c => ({
    userId: c.userId,
    username: c.username,
    role: c.role,
  }));
}

export function setupClassWebSocket(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  const HEARTBEAT_INTERVAL = 25_000;
  const CLIENT_TIMEOUT = 50_000;
  const aliveMap = new WeakMap<WebSocket, number>();

  const heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const ws of wss.clients) {
      const lastPong = aliveMap.get(ws) ?? 0;
      if (now - lastPong > CLIENT_TIMEOUT) {
        console.log("[ClassWS] Terminating stale connection (no pong)");
        ws.terminate();
        continue;
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }
  }, HEARTBEAT_INTERVAL);

  wss.on("close", () => clearInterval(heartbeatTimer));

  wss.on("connection", (ws: WebSocket) => {
    let client: ClassClient | null = null;
    aliveMap.set(ws, Date.now());
    ws.on("pong", () => aliveMap.set(ws, Date.now()));

    ws.on("message", async (raw, isBinary) => {
      aliveMap.set(ws, Date.now());
      if (isBinary) return;
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === "ping") {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "pong" }));
          return;
        }

        if (msg.type === "join") {
          const room = getOrCreateRoom(msg.classId);

          const stale: ClassClient[] = [];
          for (const c of room.clients) {
            if (c.userId === msg.userId && c.ws !== ws) {
              stale.push(c);
            }
          }
          for (const c of stale) {
            room.clients.delete(c);
            try { c.ws.terminate(); } catch {}
            console.log(`[ClassWS] Removed stale connection for user ${c.username} (id=${c.userId})`);
          }

          client = {
            ws,
            userId: msg.userId,
            username: msg.username,
            classId: msg.classId,
            role: msg.role || "learner",
          };
          room.clients.add(client);
          console.log(`[ClassWS] User ${msg.username} (id=${msg.userId}, role=${client.role}) JOINED room ${msg.classId}. Total clients: ${room.clients.size}`);

          const savedMessages = await storage.getLiveClassMessages(msg.classId);

          ws.send(JSON.stringify({
            type: "room-state",
            whiteboardActions: room.whiteboardActions,
            participants: getRoomParticipants(msg.classId),
            chatHistory: savedMessages,
            micActiveUserId: room.micActiveUserId ?? null,
          }));

          broadcastToRoom(msg.classId, {
            type: "user-joined",
            userId: msg.userId,
            username: msg.username,
            role: client.role,
            participants: getRoomParticipants(msg.classId),
          }, msg.userId);
          return;
        }

        if (!client) return;

        switch (msg.type) {
          case "draw-stream": {
            broadcastToRoom(client.classId, {
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
            broadcastToRoom(client.classId, {
              type: "draw-end",
              strokeId: msg.strokeId,
              fromUserId: client.userId,
            }, client.userId);
            break;
          }

          case "whiteboard-action": {
            const room = rooms.get(client.classId);
            if (room) {
              room.whiteboardActions.push(msg.action);
              console.log(`[ClassWS] whiteboard-action from ${client.username} (id=${client.userId}) in room ${client.classId}. Tool: ${msg.action?.tool}. Total actions: ${room.whiteboardActions.length}. Clients in room: ${room.clients.size}`);
            }
            broadcastToRoom(client.classId, {
              type: "whiteboard-action",
              action: msg.action,
              fromUserId: client.userId,
            }, client.userId);
            break;
          }

          case "whiteboard-clear": {
            const room = rooms.get(client.classId);
            if (room) room.whiteboardActions = [];
            broadcastToRoom(client.classId, {
              type: "whiteboard-clear",
              fromUserId: client.userId,
            }, client.userId);
            break;
          }

          case "whiteboard-undo": {
            const room = rooms.get(client.classId);
            if (room && room.whiteboardActions.length > 0) room.whiteboardActions.pop();
            broadcastToRoom(client.classId, {
              type: "whiteboard-undo",
              fromUserId: client.userId,
            }, client.userId);
            break;
          }

          case "whiteboard-update-image": {
            const room = rooms.get(client.classId);
            if (room) {
              const action = room.whiteboardActions.find((a: any) => a.id === msg.id);
              if (action) {
                action.x1 = msg.x1; action.y1 = msg.y1;
                action.imageW = msg.imageW; action.imageH = msg.imageH;
              }
            }
            broadcastToRoom(client.classId, {
              type: "whiteboard-update-image",
              id: msg.id, x1: msg.x1, y1: msg.y1,
              imageW: msg.imageW, imageH: msg.imageH,
            }, client.userId);
            break;
          }

          case "chat-message": {
            const saved = await storage.addLiveClassMessage({
              classId: client.classId,
              userId: client.userId,
              username: client.username,
              content: msg.content,
            });
            broadcastToRoom(client.classId, {
              type: "chat-message",
              id: saved.id,
              userId: client.userId,
              username: client.username,
              content: msg.content,
              createdAt: saved.createdAt,
            });
            break;
          }

          case "end-class": {
            if (client.role === "tutor") {
              await storage.endLiveClass(client.classId);
              broadcastToRoom(client.classId, { type: "class-ended" });
              rooms.delete(client.classId);
            }
            break;
          }

          // WebRTC signalling — relay to target user
          case "webrtc-offer":
          case "webrtc-answer":
          case "webrtc-ice": {
            sendToUser(client.classId, msg.targetUserId, {
              ...msg,
              fromUserId: client.userId,
            });
            break;
          }

          case "mic-started": {
            const room = rooms.get(client.classId);
            if (room) room.micActiveUserId = client.userId;
            broadcastToRoom(client.classId, {
              type: "mic-started",
              fromUserId: client.userId,
              fromUsername: client.username,
            }, client.userId);
            break;
          }

          case "mic-stopped": {
            const room = rooms.get(client.classId);
            if (room && room.micActiveUserId === client.userId) delete room.micActiveUserId;
            broadcastToRoom(client.classId, {
              type: "mic-stopped",
              fromUserId: client.userId,
            }, client.userId);
            break;
          }

          case "cursor-move":
            broadcastToRoom(client.classId, {
              type: "cursor-move",
              x: msg.x, y: msg.y,
              fromUserId: client.userId,
              fromUsername: client.username,
            }, client.userId);
            break;
        }
      } catch (err) {
        console.error("[ClassWS] Message error:", err);
      }
    });

    ws.on("close", () => {
      if (client) {
        const room = rooms.get(client.classId);
        if (room) {
          const wasInRoom = room.clients.has(client);
          room.clients.delete(client);
          if (!wasInRoom) {
            console.log(`[ClassWS] Stale connection closed for user ${client.username} (id=${client.userId}) — suppressing user-left`);
            return;
          }
          if (room.micActiveUserId === client.userId) delete room.micActiveUserId;
          if (room.clients.size === 0) {
            rooms.delete(client.classId);
          } else {
            broadcastToRoom(client.classId, {
              type: "user-left",
              userId: client.userId,
              username: client.username,
              participants: getRoomParticipants(client.classId),
            });
          }
        }
      }
    });

    ws.on("error", (err) => console.error("[ClassWS] WS error:", err));
  });

  console.log("[ClassWS] WebSocket server initialized on /ws/class");
  return wss;
}
