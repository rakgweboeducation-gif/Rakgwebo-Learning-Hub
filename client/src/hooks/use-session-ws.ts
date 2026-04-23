import { useEffect, useRef, useState, useCallback } from "react";

type MessageHandler = (msg: any) => void;
type BinaryHandler = (data: ArrayBuffer) => void;

export function useSessionWebSocket(sessionId: number | null, userId: number | null, username: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState<{ userId: number; username: string }[]>([]);
  const handlersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const binaryHandlersRef = useRef<Set<BinaryHandler>>(new Set());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const hasConnectedOnceRef = useRef(false);

  const on = useCallback((type: string, handler: MessageHandler) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, new Set());
    }
    handlersRef.current.get(type)!.add(handler);
    return () => {
      handlersRef.current.get(type)?.delete(handler);
    };
  }, []);

  const onBinary = useCallback((handler: BinaryHandler) => {
    binaryHandlersRef.current.add(handler);
    return () => {
      binaryHandlersRef.current.delete(handler);
    };
  }, []);

  const send = useCallback((msg: any) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      const critical = msg.type === "ping" || msg.type === "join" || msg.type === "whiteboard-action" || msg.type === "whiteboard-clear" || msg.type === "whiteboard-undo" || msg.type === "whiteboard-update-image" || msg.type === "draw-stream" || msg.type === "draw-end";
      if (!critical && ws.bufferedAmount > 65536) {
        console.warn("[SessionWS] Send buffer backed up, skipping message:", msg.type);
        return;
      }
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const sendBinary = useCallback((data: ArrayBuffer) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount > 131072) return;
      ws.send(data);
    }
  }, []);

  useEffect(() => {
    if (!sessionId || !userId || !username) return;

    const connect = () => {
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}/ws/session`;
      console.log(`[SessionWS] Connecting to ${url} (attempt ${reconnectAttemptsRef.current + 1})`);
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        console.log("[SessionWS] Connected");
        setConnected(true);
        reconnectAttemptsRef.current = 0;
        if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
        ws.send(JSON.stringify({ type: "join", sessionId, userId, username }));

        if (pingTimerRef.current) clearInterval(pingTimerRef.current);
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 20_000);

        if (hasConnectedOnceRef.current) {
          console.log("[SessionWS] Reconnected — firing _reconnected handlers");
          const reconnectHandlers = handlersRef.current.get("_reconnected");
          if (reconnectHandlers) {
            for (const handler of reconnectHandlers) handler({});
          }
        }
        hasConnectedOnceRef.current = true;
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          for (const handler of binaryHandlersRef.current) {
            handler(event.data);
          }
          return;
        }
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "pong") return;
          if (msg.type === "user-joined" || msg.type === "user-left" || msg.type === "presence") {
            setParticipants(msg.participants || []);
          }
          const handlers = handlersRef.current.get(msg.type);
          if (handlers) {
            for (const handler of handlers) {
              handler(msg);
            }
          }
        } catch (err) {
          console.error("[SessionWS] Parse error:", err);
        }
      };

      ws.onclose = (ev) => {
        console.log(`[SessionWS] Disconnected (code=${ev.code}, reason=${ev.reason})`);
        setConnected(false);
        if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
        wsRef.current = null;
        const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 15000);
        reconnectAttemptsRef.current++;
        console.log(`[SessionWS] Will reconnect in ${Math.round(delay)}ms (attempt ${reconnectAttemptsRef.current})`);
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = (err) => {
        console.error("[SessionWS] Socket error:", err);
        ws.close();
      };
    };

    connect();

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sessionId, userId, username]);

  return { connected, participants, send, sendBinary, on, onBinary };
}
