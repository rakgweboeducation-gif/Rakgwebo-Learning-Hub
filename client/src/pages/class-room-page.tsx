import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { apiUrl } from "@/lib/api-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Pen, Eraser, Minus, Square, Circle, Move, Undo2, Redo2, Trash2,
  ZoomIn, ZoomOut, RotateCcw, Send, Users, LogOut, Radio, ChevronRight, ChevronLeft,
  ImagePlus, FileText, Mic, MicOff, MousePointer2,
} from "lucide-react";

function simplifyPoints(pts: { x: number; y: number }[], tolerance = 1.5): { x: number; y: number }[] {
  if (pts.length <= 2) return pts;
  const rounded = pts.map(p => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
  let maxDist = 0, maxIdx = 0;
  const first = rounded[0], last = rounded[rounded.length - 1];
  const dx = last.x - first.x, dy = last.y - first.y;
  const lenSq = dx * dx + dy * dy;
  for (let i = 1; i < rounded.length - 1; i++) {
    let dist: number;
    if (lenSq === 0) {
      dist = Math.hypot(rounded[i].x - first.x, rounded[i].y - first.y);
    } else {
      const t = Math.max(0, Math.min(1, ((rounded[i].x - first.x) * dx + (rounded[i].y - first.y) * dy) / lenSq));
      dist = Math.hypot(rounded[i].x - (first.x + t * dx), rounded[i].y - (first.y + t * dy));
    }
    if (dist > maxDist) { maxDist = dist; maxIdx = i; }
  }
  if (maxDist > tolerance) {
    const left = simplifyPoints(rounded.slice(0, maxIdx + 1), tolerance);
    const right = simplifyPoints(rounded.slice(maxIdx), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

type WBTool = "pen" | "eraser" | "line" | "rectangle" | "circle" | "pan" | "select";
type WBAction = {
  id?: string;
  tool: WBTool | "image";
  color: string;
  lineWidth: number;
  points?: { x: number; y: number }[];
  x1?: number; y1?: number; x2?: number; y2?: number;
  imageUrl?: string;
  imageW?: number; imageH?: number;
};

type ChatMessage = {
  id?: number;
  userId: number;
  username: string;
  content: string;
  createdAt?: string;
};

type Participant = {
  userId: number;
  username: string;
  role: string;
};

const WB_TOOLS: { id: WBTool; icon: any; label: string }[] = [
  { id: "select", icon: MousePointer2, label: "Select / Move" },
  { id: "pen", icon: Pen, label: "Pen" },
  { id: "eraser", icon: Eraser, label: "Eraser" },
  { id: "line", icon: Minus, label: "Line" },
  { id: "rectangle", icon: Square, label: "Rectangle" },
  { id: "circle", icon: Circle, label: "Circle" },
  { id: "pan", icon: Move, label: "Pan" },
];

const COLORS = ["#000000", "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#ffffff"];


export default function ClassRoomPage() {
  const { id } = useParams<{ id: string }>();
  const classId = parseInt(id!);
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: cls } = useQuery({
    queryKey: ["/api/live-classes", classId],
    queryFn: () => apiRequest("GET", `/api/live-classes/${classId}`).then(r => r.json()),
    refetchInterval: 20000,
  });

  // ── WebSocket ──
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [classEnded, setClassEnded] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [showChat, setShowChat] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Whiteboard ──
  const wbCanvasRef = useRef<HTMLCanvasElement>(null);
  const wbContainerRef = useRef<HTMLDivElement>(null);
  const [wbTool, setWbTool] = useState<WBTool>("pen");
  const wbToolRef = useRef<WBTool>("pen");
  const [wbColor, setWbColor] = useState("#000000");
  const wbColorRef = useRef("#000000");
  const [wbWidth, setWbWidth] = useState(3);
  const wbWidthRef = useRef(3);
  const [wbActions, setWbActions] = useState<WBAction[]>([]);
  const wbActionsRef = useRef<WBAction[]>([]);
  wbActionsRef.current = wbActions;
  const currentActionRef = useRef<WBAction | null>(null);
  const needsRedrawRef = useRef(true);
  const redoStackRef = useRef<WBAction[]>([]);
  const drawBufferRef = useRef<{ x: number; y: number }[]>([]);
  const drawStreamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const strokeIdRef = useRef(0);
  const currentStrokeIdRef = useRef("");
  const remoteStrokesRef = useRef<Map<string, { tool: string; color: string; lineWidth: number; points: { x: number; y: number }[] }>>(new Map());
  const drawingRef = useRef(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const panXRef = useRef(0); const panYRef = useRef(0); const zoomRef = useRef(1);
  panXRef.current = panX; panYRef.current = panY; zoomRef.current = zoom;
  const panStateRafRef = useRef<number | null>(null);
  const flushPanState = useCallback(() => {
    if (panStateRafRef.current !== null) return;
    panStateRafRef.current = requestAnimationFrame(() => {
      setPanX(panXRef.current); setPanY(panYRef.current);
      panStateRafRef.current = null;
    });
  }, []);
  wbToolRef.current = wbTool;
  wbColorRef.current = wbColor;
  wbWidthRef.current = wbWidth;
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const imgFileInputRef = useRef<HTMLInputElement>(null);
  const pdfFileInputRef = useRef<HTMLInputElement>(null);

  // Multi-touch tracking

  // Selection / resize state
  const selectedImageIdRef = useRef<string | null>(null);
  type ResizeSel = { actionId: string; handle: string; startX: number; startY: number; origX1: number; origY1: number; origW: number; origH: number; draftX1: number; draftY1: number; draftW: number; draftH: number };
  const resizeSelRef = useRef<ResizeSel | null>(null);
  const [selTick, setSelTick] = useState(0);

  const isTutor = user?.role === "tutor" && cls?.tutorId === user?.id;

  const send = useCallback((msg: any) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      const critical = msg.type === "ping" || msg.type === "join" || msg.type === "whiteboard-action" || msg.type === "whiteboard-clear" || msg.type === "whiteboard-undo" || msg.type === "whiteboard-update-image" || msg.type === "draw-stream" || msg.type === "draw-end";
      if (!critical && ws.bufferedAmount > 65536) {
        console.warn("[ClassWS] Send buffer backed up, skipping message:", msg.type);
        return;
      }
      ws.send(JSON.stringify(msg));
    }
  }, []);

  // ── Mic state ──
  const [micActive, setMicActive] = useState(false);
  const micActiveRef = useRef(false);
  const [learnerMicActive, setLearnerMicActive] = useState(false);
  const learnerMicRef = useRef(false);
  const [remoteMicUserId, setRemoteMicUserId] = useState<number | null>(null);
  const [activeMicUserIds, setActiveMicUserIds] = useState<Set<number>>(new Set());

  // ── WebRTC audio (Teams-like peer-to-peer) ──
  const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const audioElementsRef = useRef<Map<number, HTMLAudioElement>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<number, RTCIceCandidateInit[]>>(new Map());
  const participantsRef = useRef<Participant[]>([]);

  const cleanupPeer = useCallback((remoteUserId: number) => {
    const pc = peerConnectionsRef.current.get(remoteUserId);
    if (pc) { try { pc.close(); } catch {} peerConnectionsRef.current.delete(remoteUserId); }
    const audio = audioElementsRef.current.get(remoteUserId);
    if (audio) { audio.pause(); audio.srcObject = null; audio.remove(); audioElementsRef.current.delete(remoteUserId); }
    pendingIceCandidatesRef.current.delete(remoteUserId);
  }, []);

  const createPeerConnection = useCallback((remoteUserId: number, forceNew = false): RTCPeerConnection => {
    const existing = peerConnectionsRef.current.get(remoteUserId);
    if (existing) {
      if (!forceNew && existing.signalingState !== 'closed' && existing.connectionState !== 'failed') return existing;
      try { existing.close(); } catch {}
      peerConnectionsRef.current.delete(remoteUserId);
    }
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnectionsRef.current.set(remoteUserId, pc);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: 'webrtc-ice', targetUserId: remoteUserId, candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      let audio = audioElementsRef.current.get(remoteUserId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        (audio as any).playsInline = true;
        audio.volume = 1.0;
        document.body.appendChild(audio);
        audioElementsRef.current.set(remoteUserId, audio);
      }
      audio.srcObject = e.streams[0] || new MediaStream([e.track]);
      audio.play().catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        console.warn('[WebRTC] Connection failed with user', remoteUserId);
      }
    };
    return pc;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send]);

  const offerToUser = useCallback(async (remoteUserId: number) => {
    const pc = createPeerConnection(remoteUserId, true);
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      send({ type: 'webrtc-offer', targetUserId: remoteUserId, sdp: { type: offer.type, sdp: offer.sdp } });
    } catch (e) { console.error('[WebRTC] offer failed:', e); }
  }, [createPeerConnection, send]);

  const handleRtcOffer = useCallback(async (fromUserId: number, sdp: RTCSessionDescriptionInit) => {
    const pc = createPeerConnection(fromUserId, true);
    try {
      await pc.setRemoteDescription(sdp);
      const buffered = pendingIceCandidatesRef.current.get(fromUserId) || [];
      for (const c of buffered) { await pc.addIceCandidate(c).catch(() => {}); }
      pendingIceCandidatesRef.current.delete(fromUserId);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ type: 'webrtc-answer', targetUserId: fromUserId, sdp: { type: answer.type, sdp: answer.sdp } });
    } catch (e) { console.error('[WebRTC] answer failed:', e); }
  }, [createPeerConnection, send]);

  const handleRtcAnswer = useCallback(async (fromUserId: number, sdp: RTCSessionDescriptionInit) => {
    const pc = peerConnectionsRef.current.get(fromUserId);
    if (!pc) return;
    try {
      await pc.setRemoteDescription(sdp);
      const buffered = pendingIceCandidatesRef.current.get(fromUserId) || [];
      for (const c of buffered) { await pc.addIceCandidate(c).catch(() => {}); }
      pendingIceCandidatesRef.current.delete(fromUserId);
    } catch (e) { console.error('[WebRTC] set answer failed:', e); }
  }, []);

  const handleRtcIce = useCallback(async (fromUserId: number, candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionsRef.current.get(fromUserId);
    if (pc && pc.remoteDescription) {
      try { await pc.addIceCandidate(candidate); }
      catch (e) { console.error('[WebRTC] ice failed:', e); }
    } else {
      const buf = pendingIceCandidatesRef.current.get(fromUserId) || [];
      buf.push(candidate);
      pendingIceCandidatesRef.current.set(fromUserId, buf);
    }
  }, []);

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      localStreamRef.current = stream;
      const myId = user?.id;
      participantsRef.current.forEach(p => {
        if (p.userId !== myId) offerToUser(p.userId);
      });
      send({ type: 'mic-started' });
      return stream;
    } catch {
      toast({ title: 'Microphone access denied', description: 'Please allow microphone access in your browser.', variant: 'destructive' });
      return null;
    }
  }, [user, offerToUser, send, toast]);

  const stopMic = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    for (const uid of Array.from(peerConnectionsRef.current.keys())) cleanupPeer(uid);
    send({ type: 'mic-stopped' });
  }, [cleanupPeer, send]);

  const toggleMic = useCallback(async () => {
    if (micActive) {
      stopMic();
      setMicActive(false);
      micActiveRef.current = false;
    } else {
      const stream = await startMic();
      if (stream) {
        setMicActive(true);
        micActiveRef.current = true;
      }
    }
  }, [micActive, startMic, stopMic]);

  const toggleLearnerMic = useCallback(async () => {
    if (learnerMicRef.current) {
      stopMic();
      setLearnerMicActive(false);
      learnerMicRef.current = false;
    } else {
      const stream = await startMic();
      if (stream) {
        setLearnerMicActive(true);
        learnerMicRef.current = true;
      }
    }
  }, [startMic, stopMic]);

    // ── WebSocket connection with auto-reconnect ──
  const connectWs = useCallback(() => {
    if (!user || !classId) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/ws/class`;
    console.log(`[ClassWS] Connecting to ${url} (attempt ${reconnectAttemptsRef.current + 1})`);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[ClassWS] Connected — performing full session reset");
      setConnected(true);
      reconnectAttemptsRef.current = 0;
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }

      for (const uid of Array.from(peerConnectionsRef.current.keys())) cleanupPeer(uid);
      for (const [uid, audio] of Array.from(audioElementsRef.current.entries())) {
        audio.pause(); audio.srcObject = null; audio.remove();
        audioElementsRef.current.delete(uid);
      }
      pendingIceCandidatesRef.current.clear();

      setWbActions([]);
      remoteStrokesRef.current.clear();
      setParticipants([]);
      participantsRef.current = [];
      setChatMessages([]);
      setRemoteMicUserId(null);
      setActiveMicUserIds(new Set());

      ws.send(JSON.stringify({ type: "join", classId, userId: user.id, username: user.username, role: user.role }));

      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 20_000);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "pong") return;
        switch (msg.type) {
          case "room-state": {
            const incoming = msg.whiteboardActions || [];
            setWbActions(incoming);
            const parts = msg.participants || [];
            participantsRef.current = parts;
            setParticipants(parts);
            setChatMessages(msg.chatHistory || []);
            if (msg.micActiveUserId && msg.micActiveUserId !== user.id) {
              setRemoteMicUserId(msg.micActiveUserId);
            }
            console.log(`[ClassWS] room-state received: ${incoming.length} wb actions, ${parts.length} participants`);

            if (micActiveRef.current || learnerMicRef.current) {
              const oldStream = localStreamRef.current;
              const tracksAlive = oldStream && oldStream.getTracks().some(t => t.readyState === 'live');
              if (!tracksAlive) {
                console.log("[ClassWS] Mic stream dead after reconnect — re-acquiring mic");
                oldStream?.getTracks().forEach(t => t.stop());
                localStreamRef.current = null;
                navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
                  .then(stream => {
                    localStreamRef.current = stream;
                    send({ type: 'mic-started' });
                    parts.forEach((p: Participant) => {
                      if (p.userId !== user.id) {
                        setTimeout(() => offerToUser(p.userId), 300);
                      }
                    });
                  })
                  .catch(() => {
                    setMicActive(false);
                    micActiveRef.current = false;
                    setLearnerMicActive(false);
                    learnerMicRef.current = false;
                    console.warn("[ClassWS] Failed to re-acquire mic after reconnect");
                  });
              } else {
                console.log("[ClassWS] Mic stream still alive — re-offering to all participants");
                send({ type: 'mic-started' });
                parts.forEach((p: Participant) => {
                  if (p.userId !== user.id) {
                    setTimeout(() => offerToUser(p.userId), 300);
                  }
                });
              }
            }
            break;
          }

          case "user-joined": {
            const parts = msg.participants || [];
            participantsRef.current = parts;
            setParticipants(parts);
            // If we have an active mic, offer to the new participant
            if (localStreamRef.current && msg.userId !== user.id) {
              offerToUser(msg.userId);
            }
            break;
          }

          case "user-left": {
            const parts = msg.participants || [];
            participantsRef.current = parts;
            setParticipants(parts);
            cleanupPeer(msg.userId);
            break;
          }

          case "draw-stream": {
            const existing = remoteStrokesRef.current.get(msg.strokeId);
            if (existing) {
              existing.points.push(...msg.points);
            } else {
              remoteStrokesRef.current.set(msg.strokeId, {
                tool: msg.tool, color: msg.color, lineWidth: msg.lineWidth,
                points: [...msg.points],
              });
            }
            needsRedrawRef.current = true;
            break;
          }

          case "draw-end":
            remoteStrokesRef.current.delete(msg.strokeId);
            needsRedrawRef.current = true;
            break;

          case "whiteboard-action":
            if (msg.fromUserId) {
              const prefix = `${msg.fromUserId}-`;
              for (const key of remoteStrokesRef.current.keys()) {
                if (key.startsWith(prefix)) remoteStrokesRef.current.delete(key);
              }
            }
            setWbActions(prev => [...prev, msg.action]);
            break;

          case "whiteboard-clear":
            setWbActions([]);
            redoStackRef.current = [];
            remoteStrokesRef.current.clear();
            break;

          case "whiteboard-undo":
            setWbActions(prev => prev.length > 0 ? prev.slice(0, -1) : prev);
            break;

          case "whiteboard-update-image": {
            setWbActions(prev => prev.map(a =>
              a.id === msg.id
                ? { ...a, x1: msg.x1, y1: msg.y1, imageW: msg.imageW, imageH: msg.imageH }
                : a
            ));
            break;
          }

          case "chat-message":
            setChatMessages(prev => {
              if (prev.some(m => m.id && m.id === msg.id)) return prev;
              return [...prev, { id: msg.id, userId: msg.userId, username: msg.username, content: msg.content, createdAt: msg.createdAt }];
            });
            setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
            break;

          case "class-ended":
            setClassEnded(true);
            toast({ title: "Class has ended" });
            break;

          case "mic-started":
            setRemoteMicUserId(msg.fromUserId);
            setActiveMicUserIds(prev => { const s = new Set(prev); s.add(msg.fromUserId); return s; });
            break;

          case "mic-stopped":
            setActiveMicUserIds(prev => { const s = new Set(prev); s.delete(msg.fromUserId); return s; });
            setRemoteMicUserId(prev => (prev === msg.fromUserId ? null : prev));
            cleanupPeer(msg.fromUserId);
            if (localStreamRef.current) {
              setTimeout(() => offerToUser(msg.fromUserId), 500);
            }
            break;

          // ── WebRTC signaling ──
          case "webrtc-offer":
            handleRtcOffer(msg.fromUserId, msg.sdp);
            break;
          case "webrtc-answer":
            handleRtcAnswer(msg.fromUserId, msg.sdp);
            break;
          case "webrtc-ice":
            handleRtcIce(msg.fromUserId, msg.candidate);
            break;
        }
      } catch (err) {
        console.error("[ClassWS] Message parse error:", err);
      }
    };

    ws.onclose = (ev) => {
      console.log(`[ClassWS] Disconnected (code=${ev.code}, reason=${ev.reason})`);
      setConnected(false);
      if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
      wsRef.current = null;
      const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 15000);
      reconnectAttemptsRef.current++;
      console.log(`[ClassWS] Will reconnect in ${Math.round(delay)}ms (attempt ${reconnectAttemptsRef.current})`);
      reconnectTimerRef.current = setTimeout(() => connectWs(), delay);
    };

    ws.onerror = (err) => {
      console.error("[ClassWS] Socket error:", err);
      ws.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, classId, toast, send, offerToUser, cleanupPeer, handleRtcOffer, handleRtcAnswer, handleRtcIce]);

  useEffect(() => {
    if (!user) return;
    connectWs();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      // Stop local stream
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      // Close all peer connections and audio elements
      for (const uid of Array.from(peerConnectionsRef.current.keys())) {
        peerConnectionsRef.current.get(uid)?.close();
      }
      peerConnectionsRef.current.clear();
      for (const audio of Array.from(audioElementsRef.current.values())) {
        audio.srcObject = null;
        audio.remove();
      }
      audioElementsRef.current.clear();
    };
  }, [connectWs]);

  // ── Whiteboard render (reads only from refs — never recreated) ──
  const renderWhiteboard = useCallback(() => {
    const canvas = wbCanvasRef.current;
    if (!canvas) return;
    if (canvas.width === 0 || canvas.height === 0) {
      const container = wbContainerRef.current;
      if (container && container.clientWidth > 0 && container.clientHeight > 0) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      } else {
        return;
      }
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(panXRef.current, panYRef.current);
    ctx.scale(zoomRef.current, zoomRef.current);

    const drawAction = (a: WBAction) => {
      if (a.tool === "image" && a.imageUrl && a.x1 !== undefined) {
        const cached = imageCacheRef.current.get(a.imageUrl);
        if (cached && cached.complete && cached.naturalWidth > 0) {
          ctx.drawImage(cached, a.x1, a.y1!, a.imageW || cached.naturalWidth, a.imageH || cached.naturalHeight);
        } else if (!cached) {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => { imageCacheRef.current.set(a.imageUrl!, img); needsRedrawRef.current = true; };
          img.src = a.imageUrl;
          imageCacheRef.current.set(a.imageUrl, img);
        }
        return;
      }
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = a.lineWidth;
      ctx.strokeStyle = a.color;

      if ((a.tool === "pen" || a.tool === "eraser") && a.points && a.points.length > 0) {
        if (a.tool === "eraser") ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.moveTo(a.points[0].x, a.points[0].y);
        for (let i = 1; i < a.points.length; i++) ctx.lineTo(a.points[i].x, a.points[i].y);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      } else if (a.tool === "line" && a.x1 !== undefined) {
        ctx.beginPath(); ctx.moveTo(a.x1, a.y1!); ctx.lineTo(a.x2!, a.y2!); ctx.stroke();
      } else if (a.tool === "rectangle" && a.x1 !== undefined) {
        ctx.strokeRect(a.x1, a.y1!, a.x2! - a.x1, a.y2! - a.y1!);
      } else if (a.tool === "circle" && a.x1 !== undefined) {
        const rx = Math.abs(a.x2! - a.x1) / 2;
        const ry = Math.abs(a.y2! - a.y1!) / 2;
        const cx = a.x1 + (a.x2! - a.x1) / 2;
        const cy = a.y1! + (a.y2! - a.y1!) / 2;
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      }
    };

    const all = [...wbActionsRef.current];
    if (currentActionRef.current) all.push(currentActionRef.current);
    const dragSel = resizeSelRef.current;
    for (const a of all) {
      if (dragSel && a.id === dragSel.actionId && a.tool === 'image') {
        drawAction({ ...a, x1: dragSel.draftX1, y1: dragSel.draftY1, imageW: dragSel.draftW, imageH: dragSel.draftH });
      } else {
        drawAction(a);
      }
    }

    for (const [, stroke] of remoteStrokesRef.current) {
      if (stroke.points.length < 2) continue;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = stroke.tool === "eraser" ? "#ffffff" : stroke.color;
      ctx.lineWidth = stroke.lineWidth;
      if (stroke.tool === "eraser") ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    }

    if (selectedImageIdRef.current) {
      let sx: number, sy: number, sw: number, sh: number;
      if (dragSel && dragSel.actionId === selectedImageIdRef.current) {
        sx = dragSel.draftX1; sy = dragSel.draftY1; sw = dragSel.draftW; sh = dragSel.draftH;
      } else {
        const a = wbActionsRef.current.find(a => a.id === selectedImageIdRef.current);
        if (a && a.tool === "image" && a.x1 !== undefined && a.imageW && a.imageH) {
          sx = a.x1; sy = a.y1!; sw = a.imageW; sh = a.imageH;
        } else {
          sx = sy = sw = sh = 0;
        }
      }
      if (sw > 0 && sh > 0) {
        const hs = 10 / zoomRef.current;
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2 / zoomRef.current;
        ctx.setLineDash([6 / zoomRef.current, 3 / zoomRef.current]);
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.setLineDash([]);
        ctx.fillStyle = "#3b82f6";
        const corners = [{ x: sx, y: sy }, { x: sx + sw, y: sy }, { x: sx, y: sy + sh }, { x: sx + sw, y: sy + sh }];
        for (const c of corners) {
          ctx.fillRect(c.x - hs / 2, c.y - hs / 2, hs, hs);
        }
      }
    }

    ctx.restore();
  }, []); // no deps — reads only from refs

  // ── Stable RAF loop ──
  useEffect(() => {
    let raf: number;
    const loop = () => {
      if (needsRedrawRef.current) { renderWhiteboard(); needsRedrawRef.current = false; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    needsRedrawRef.current = true;
    renderWhiteboard();
  }, [wbActions, panX, panY, zoom, selTick]);

  // ── Resize canvas to container ──
  useEffect(() => {
    const container = wbContainerRef.current;
    const canvas = wbCanvasRef.current;
    if (!container || !canvas) return;

    const syncSize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      console.log(`[WB-RESIZE] Container: ${w}x${h}, Canvas: ${canvas.width}x${canvas.height}`);
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
        needsRedrawRef.current = true;
        console.log(`[WB-RESIZE] Canvas resized to ${w}x${h}`);
      }
    };

    const ro = new ResizeObserver(syncSize);
    ro.observe(container);
    syncSize();
    const retryTimer = setTimeout(syncSize, 300);
    const retryTimer2 = setTimeout(syncSize, 1000);

    return () => { ro.disconnect(); clearTimeout(retryTimer); clearTimeout(retryTimer2); };
  }, []);

  // ── Canvas input: mouse + touch events, move/up on window so they never miss ──
  useEffect(() => {
    const canvas = wbCanvasRef.current;
    if (!canvas) return;

    const getPt = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left - panXRef.current) / zoomRef.current,
        y: (clientY - rect.top - panYRef.current) / zoomRef.current,
      };
    };

    const hitTestImage = (pt: { x: number; y: number }) => {
      if (selectedImageIdRef.current) {
        const a = wbActionsRef.current.find(a => a.id === selectedImageIdRef.current);
        if (a && a.x1 !== undefined && a.imageW && a.imageH) {
          const hs = 14 / zoomRef.current;
          const corners = [
            { id: 'tl', x: a.x1, y: a.y1! }, { id: 'tr', x: a.x1 + a.imageW, y: a.y1! },
            { id: 'bl', x: a.x1, y: a.y1! + a.imageH }, { id: 'br', x: a.x1 + a.imageW, y: a.y1! + a.imageH },
          ];
          for (const c of corners) {
            if (Math.abs(pt.x - c.x) < hs && Math.abs(pt.y - c.y) < hs)
              return { handle: c.id, a };
          }
          if (pt.x > a.x1 && pt.x < a.x1 + a.imageW && pt.y > a.y1! && pt.y < a.y1! + a.imageH)
            return { handle: 'move', a };
        }
      }
      for (let i = wbActionsRef.current.length - 1; i >= 0; i--) {
        const a = wbActionsRef.current[i];
        if (a.tool === 'image' && a.id && a.x1 !== undefined && a.imageW && a.imageH &&
          pt.x > a.x1 && pt.x < a.x1 + a.imageW && pt.y > a.y1! && pt.y < a.y1! + a.imageH)
          return { handle: 'move', a };
      }
      return null;
    };

    const flushDrawBuffer = () => {
      if (drawBufferRef.current.length === 0) return;
      const pts = drawBufferRef.current.splice(0);
      const cur = currentActionRef.current;
      if (!cur) return;
      send({
        type: 'draw-stream',
        strokeId: currentStrokeIdRef.current,
        points: pts,
        tool: cur.tool,
        color: cur.color,
        lineWidth: cur.lineWidth,
      });
    };

    const onBegin = (clientX: number, clientY: number) => {
      const tool = wbToolRef.current;
      const pt = getPt(clientX, clientY);
      if (tool === 'select') {
        const hit = hitTestImage(pt);
        if (hit) {
          selectedImageIdRef.current = hit.a.id ?? null;
          resizeSelRef.current = { actionId: hit.a.id!, handle: hit.handle, startX: pt.x, startY: pt.y, origX1: hit.a.x1!, origY1: hit.a.y1!, origW: hit.a.imageW!, origH: hit.a.imageH!, draftX1: hit.a.x1!, draftY1: hit.a.y1!, draftW: hit.a.imageW!, draftH: hit.a.imageH! };
        } else {
          selectedImageIdRef.current = null;
          resizeSelRef.current = null;
        }
        setSelTick(t => t + 1);
        needsRedrawRef.current = true;
        return;
      }
      if (tool === 'pan') {
        isPanningRef.current = true;
        panStartRef.current = { x: clientX, y: clientY, panX: panXRef.current, panY: panYRef.current };
        return;
      }
      drawingRef.current = true;
      const color = tool === 'eraser' ? '#ffffff' : wbColorRef.current;
      currentActionRef.current = (tool === 'pen' || tool === 'eraser')
        ? { tool, color, lineWidth: wbWidthRef.current, points: [pt] }
        : { tool, color, lineWidth: wbWidthRef.current, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
      strokeIdRef.current++;
      currentStrokeIdRef.current = `${user?.id}-${strokeIdRef.current}`;
      drawBufferRef.current = [pt];
      if ((tool === 'pen' || tool === 'eraser') && !drawStreamTimerRef.current) {
        drawStreamTimerRef.current = setInterval(flushDrawBuffer, 33);
      }
      needsRedrawRef.current = true;
    };

    const onMove = (clientX: number, clientY: number) => {
      if (resizeSelRef.current) {
        const sel = resizeSelRef.current;
        const pt = getPt(clientX, clientY);
        const dx = pt.x - sel.startX; const dy = pt.y - sel.startY;
        if (sel.handle === 'move') { sel.draftX1 = sel.origX1 + dx; sel.draftY1 = sel.origY1 + dy; sel.draftW = sel.origW; sel.draftH = sel.origH; }
        else if (sel.handle === 'br') { sel.draftW = Math.max(40, sel.origW + dx); sel.draftH = Math.max(40, sel.origH + dy); }
        else if (sel.handle === 'bl') { const nw = Math.max(40, sel.origW - dx); sel.draftX1 = sel.origX1 + (sel.origW - nw); sel.draftW = nw; sel.draftH = Math.max(40, sel.origH + dy); }
        else if (sel.handle === 'tr') { const nh = Math.max(40, sel.origH - dy); sel.draftY1 = sel.origY1 + (sel.origH - nh); sel.draftW = Math.max(40, sel.origW + dx); sel.draftH = nh; }
        else if (sel.handle === 'tl') { const nw = Math.max(40, sel.origW - dx); const nh = Math.max(40, sel.origH - dy); sel.draftX1 = sel.origX1 + (sel.origW - nw); sel.draftY1 = sel.origY1 + (sel.origH - nh); sel.draftW = nw; sel.draftH = nh; }
        needsRedrawRef.current = true;
        return;
      }
      if (isPanningRef.current) {
        panXRef.current = panStartRef.current.panX + (clientX - panStartRef.current.x);
        panYRef.current = panStartRef.current.panY + (clientY - panStartRef.current.y);
        flushPanState();
        needsRedrawRef.current = true;
        return;
      }
      if (!drawingRef.current || !currentActionRef.current) return;
      const pt = getPt(clientX, clientY);
      const cur = currentActionRef.current;
      if (cur.tool === 'pen' || cur.tool === 'eraser') {
        cur.points!.push(pt);
        drawBufferRef.current.push(pt);
      } else {
        cur.x2 = pt.x; cur.y2 = pt.y;
      }
      needsRedrawRef.current = true;
    };

    const onEnd = () => {
      if (resizeSelRef.current) {
        const sel = resizeSelRef.current;
        const { actionId, draftX1, draftY1, draftW, draftH } = sel;
        send({ type: 'whiteboard-update-image', id: actionId, x1: draftX1, y1: draftY1, imageW: draftW, imageH: draftH });
        setWbActions(prev => prev.map(act =>
          act.id === actionId
            ? { ...act, x1: draftX1, y1: draftY1, imageW: draftW, imageH: draftH }
            : act
        ));
        resizeSelRef.current = null;
        return;
      }
      if (isPanningRef.current) { isPanningRef.current = false; return; }
      if (!drawingRef.current || !currentActionRef.current) return;
      drawingRef.current = false;
      const isPenOrEraser = currentActionRef.current.tool === 'pen' || currentActionRef.current.tool === 'eraser';
      if (drawStreamTimerRef.current) { clearInterval(drawStreamTimerRef.current); drawStreamTimerRef.current = null; }
      if (isPenOrEraser) {
        flushDrawBuffer();
        send({ type: 'draw-end', strokeId: currentStrokeIdRef.current });
      }
      drawBufferRef.current = [];
      const finished = { ...currentActionRef.current };
      if (finished.points) finished.points = [...finished.points];
      if (finished.points && finished.points.length > 3) {
        finished.points = simplifyPoints(finished.points, 1.5);
      }
      currentActionRef.current = null;
      setWbActions(prev => [...prev, finished]);
      redoStackRef.current = [];
      send({ type: 'whiteboard-action', action: finished });
      needsRedrawRef.current = true;
    };

    const onCancel = () => {
      drawingRef.current = false;
      isPanningRef.current = false;
      resizeSelRef.current = null;
      currentActionRef.current = null;
      if (drawStreamTimerRef.current) { clearInterval(drawStreamTimerRef.current); drawStreamTimerRef.current = null; }
      drawBufferRef.current = [];
      needsRedrawRef.current = true;
    };

    // Mouse events — mousedown on canvas, move/up on window
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      onBegin(e.clientX, e.clientY);
    };
    const onMouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const onMouseUp = () => onEnd();

    // Touch events — touchstart on canvas, move/end on window
    let pinching = false;
    let lastPinchDist = 0;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length >= 2) {
        pinching = true;
        drawingRef.current = false;
        isPanningRef.current = false;
        currentActionRef.current = null;
        const t0 = e.touches[0]; const t1 = e.touches[1];
        lastPinchDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        return;
      }
      pinching = false;
      onBegin(e.touches[0].clientX, e.touches[0].clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length >= 2 && pinching) {
        const t0 = e.touches[0]; const t1 = e.touches[1];
        const newDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        if (lastPinchDist > 0) {
          const scale = newDist / lastPinchDist;
          const cx = (t0.clientX + t1.clientX) / 2;
          const cy = (t0.clientY + t1.clientY) / 2;
          const rect = canvas.getBoundingClientRect();
          const canvasCx = cx - rect.left; const canvasCy = cy - rect.top;
          const newZoom = Math.min(Math.max(zoomRef.current * scale, 0.1), 10);
          const newPanX = canvasCx - (canvasCx - panXRef.current) * (newZoom / zoomRef.current);
          const newPanY = canvasCy - (canvasCy - panYRef.current) * (newZoom / zoomRef.current);
          zoomRef.current = newZoom; panXRef.current = newPanX; panYRef.current = newPanY;
          setZoom(newZoom); setPanX(newPanX); setPanY(newPanY);
          needsRedrawRef.current = true;
        }
        lastPinchDist = newDist;
        return;
      }
      if (e.touches.length === 1 && !pinching)
        onMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) { pinching = false; onEnd(); }
      else if (e.touches.length < 2) pinching = false;
    };

    const onTouchCancel = () => { pinching = false; onCancel(); };

    // Wheel — zoom/pan
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.min(Math.max(zoomRef.current * delta, 0.1), 10);
        const newPanX = mouseX - (mouseX - panXRef.current) * (newZoom / zoomRef.current);
        const newPanY = mouseY - (mouseY - panYRef.current) * (newZoom / zoomRef.current);
        zoomRef.current = newZoom; panXRef.current = newPanX; panYRef.current = newPanY;
        setZoom(newZoom); setPanX(newPanX); setPanY(newPanY);
      } else {
        panXRef.current -= e.shiftKey ? e.deltaY : e.deltaX;
        panYRef.current -= e.shiftKey ? 0 : e.deltaY;
        flushPanState();
      }
      needsRedrawRef.current = true;
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchCancel);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchCancel);
      canvas.removeEventListener('wheel', onWheel);
      if (drawStreamTimerRef.current) { clearInterval(drawStreamTimerRef.current); drawStreamTimerRef.current = null; }
    };
  }, [send]);

  // ── Whiteboard toolbar ──
  const handleUndo = () => {
    setWbActions(prev => {
      if (prev.length === 0) return prev;
      const popped = prev[prev.length - 1];
      redoStackRef.current.push(popped);
      send({ type: "whiteboard-undo" });
      return prev.slice(0, -1);
    });
  };

  const handleRedo = () => {
    if (redoStackRef.current.length === 0) return;
    const action = redoStackRef.current.pop()!;
    setWbActions(prev => [...prev, action]);
    send({ type: "whiteboard-action", action });
  };

  const handleClear = () => {
    setWbActions([]);
    redoStackRef.current = [];
    selectedImageIdRef.current = null;
    send({ type: "whiteboard-clear" });
  };

  // ── Image upload ──
  const handleImageFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(apiUrl("/api/chat/upload"), { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const url = data.url;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const maxW = 800; const maxH = 600;
        const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        imageCacheRef.current.set(url, img);
        const viewX = (50 - panXRef.current) / zoomRef.current;
        const viewY = (50 - panYRef.current) / zoomRef.current;
        const action: WBAction = {
          id: crypto.randomUUID(),
          tool: "image", color: "", lineWidth: 0,
          x1: viewX, y1: viewY, imageUrl: url, imageW: w, imageH: h,
        };
        setWbActions(prev => [...prev, action]);
        redoStackRef.current = [];
        send({ type: "whiteboard-action", action });
      };
      img.src = url;
    } catch {
      toast({ title: "Image upload failed", variant: "destructive" });
    }
  };

  // ── PDF page capture ──
  const handlePdfFile = async (file: File) => {
    try {
      const { GlobalWorkerOptions, getDocument } = await import("pdfjs-dist");
      GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 });
      const offscreen = document.createElement("canvas");
      offscreen.width = viewport.width;
      offscreen.height = viewport.height;
      const ctx2 = offscreen.getContext("2d")!;
      await page.render({ canvasContext: ctx2, canvas: offscreen, viewport }).promise;
      offscreen.toBlob(async (blob) => {
        if (!blob) return;
        await handleImageFile(new File([blob], "pdf-page.png", { type: "image/png" }));
      }, "image/png");
    } catch {
      toast({ title: "PDF load failed", variant: "destructive" });
    }
  };

  // ── Chat ──
  const sendChatMessage = () => {
    const content = chatInput.trim();
    if (!content || !connected) return;
    send({ type: "chat-message", content });
    setChatInput("");
  };

  // ── End class ──
  const handleEndClass = async () => {
    if (!isTutor) return;
    send({ type: "end-class" });
    try { await apiRequest("POST", `/api/live-classes/${classId}/end`); } catch {}
    toast({ title: "Class ended" });
    navigate("/live-classes");
  };

  const getCursorStyle = () => {
    if (wbTool === "pan") return isPanningRef.current ? "grabbing" : "grab";
    if (wbTool === "select") {
      if (resizeSelRef.current) {
        const h = resizeSelRef.current.handle;
        if (h === "move") return "move";
        if (h === "tl" || h === "br") return "nwse-resize";
        if (h === "tr" || h === "bl") return "nesw-resize";
      }
      return "default";
    }
    if (wbTool === "eraser") return "cell";
    return "crosshair";
  };

  if (classEnded) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] gap-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <Radio className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold">Class Has Ended</h2>
        <p className="text-muted-foreground">The tutor has ended this session.</p>
        <Button onClick={() => navigate("/live-classes")}>Back to Live Classes</Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Hidden file inputs */}
      <input ref={imgFileInputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ""; }} />
      <input ref={pdfFileInputRef} type="file" accept="application/pdf" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfFile(f); e.target.value = ""; }} />

      {/* Main whiteboard area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b bg-background flex-shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className={cn("w-2 h-2 rounded-full flex-shrink-0", connected ? "bg-green-500" : "bg-yellow-500 animate-pulse")} />
            {cls?.status === "live" ? (
              <Badge variant="destructive" className="text-xs flex items-center gap-1 flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs flex-shrink-0">Ended</Badge>
            )}
            <span className="font-semibold truncate">{cls?.title || "Live Class"}</span>
            {cls?.subject && <Badge variant="outline" className="text-xs hidden sm:flex">{cls.subject}</Badge>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Live audio indicators */}
            {activeMicUserIds.size > 0 && (
              <div className="flex items-center gap-1 text-xs text-green-600 animate-pulse">
                <Mic className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {activeMicUserIds.size === 1
                    ? (participants.find(p => activeMicUserIds.has(p.userId))?.username || "Someone") + " is live"
                    : `${activeMicUserIds.size} mics live`}
                </span>
              </div>
            )}
            {/* Mic toggle for tutors */}
            {isTutor && (
              <Button
                size="sm"
                variant={micActive ? "destructive" : "outline"}
                onClick={toggleMic}
                className="gap-1"
                data-testid="button-toggle-mic"
              >
                {micActive ? <><MicOff className="w-3.5 h-3.5" /> Mute</> : <><Mic className="w-3.5 h-3.5" /> Go Live</>}
              </Button>
            )}
            {/* Mic toggle for learners */}
            {!isTutor && (
              <Button
                size="sm"
                variant={learnerMicActive ? "destructive" : "outline"}
                onClick={toggleLearnerMic}
                className="gap-1"
                data-testid="button-learner-mic"
              >
                {learnerMicActive ? <><MicOff className="w-3.5 h-3.5" /> Mute</> : <><Mic className="w-3.5 h-3.5" /> Mic</>}
              </Button>
            )}
            <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1">
              <Users className="w-3 h-3" /> {participants.length}
            </span>
            {isTutor && cls?.status === "live" && (
              <Button size="sm" variant="destructive" onClick={handleEndClass} data-testid="button-end-class">End Class</Button>
            )}
            <Button size="sm" variant="outline" onClick={() => navigate("/live-classes")} data-testid="button-leave-class">
              <LogOut className="w-3.5 h-3.5 mr-1" /> Leave
            </Button>
            <Button size="icon" variant="ghost" className="md:hidden" onClick={() => setShowChat(p => !p)}>
              {showChat ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-muted/30 flex-shrink-0 flex-wrap">
          {WB_TOOLS.map(t => (
            <Button
              key={t.id}
              size="icon"
              variant={wbTool === t.id ? "default" : "ghost"}
              className="h-7 w-7"
              onClick={() => { setWbTool(t.id); wbToolRef.current = t.id; }}
              title={t.label}
              data-testid={`tool-${t.id}`}
            >
              <t.icon className="w-3.5 h-3.5" />
            </Button>
          ))}
          <div className="w-px h-5 bg-border mx-1" />
          {COLORS.map(c => (
            <button
              key={c}
              className={`w-5 h-5 rounded-full border-2 transition-transform ${wbColor === c ? "border-primary scale-110" : "border-border hover:scale-105"}`}
              style={{ backgroundColor: c, boxShadow: c === "#ffffff" ? "inset 0 0 0 1px #ccc" : undefined }}
              onClick={() => { setWbColor(c); wbColorRef.current = c; }}
            />
          ))}
          <div className="w-px h-5 bg-border mx-1" />
          <div className="flex items-center gap-1 w-20">
            <Slider value={[wbWidth]} onValueChange={([v]) => { setWbWidth(v); wbWidthRef.current = v; }} min={1} max={20} step={1} />
          </div>
          <div className="w-px h-5 bg-border mx-1" />
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleUndo} title="Undo"><Undo2 className="w-3.5 h-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleRedo} title="Redo"><Redo2 className="w-3.5 h-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleClear} title="Clear board"><Trash2 className="w-3.5 h-3.5" /></Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Upload image" onClick={() => imgFileInputRef.current?.click()}>
            <ImagePlus className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Insert PDF page" onClick={() => pdfFileInputRef.current?.click()}>
            <FileText className="w-3.5 h-3.5" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Zoom in" onClick={() => {
            const nz = Math.min(zoomRef.current * 1.2, 10);
            zoomRef.current = nz; setZoom(nz); needsRedrawRef.current = true;
          }}><ZoomIn className="w-3.5 h-3.5" /></Button>
          <span className="text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Zoom out" onClick={() => {
            const nz = Math.max(zoomRef.current * 0.8, 0.1);
            zoomRef.current = nz; setZoom(nz); needsRedrawRef.current = true;
          }}><ZoomOut className="w-3.5 h-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Reset view" onClick={() => {
            setZoom(1); setPanX(0); setPanY(0);
            zoomRef.current = 1; panXRef.current = 0; panYRef.current = 0;
            needsRedrawRef.current = true;
          }}><RotateCcw className="w-3.5 h-3.5" /></Button>
        </div>

        {/* Select tool hint */}
        {wbTool === "select" && (
          <div className="px-3 py-1 text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/30 border-b">
            Click an image to select it, then drag corners to resize or drag to move.
          </div>
        )}

        {/* Canvas */}
        <div ref={wbContainerRef} className="relative flex-1 overflow-hidden min-h-[200px]">
          <canvas
            ref={wbCanvasRef}
            className="absolute inset-0 w-full h-full bg-white"
            style={{ cursor: getCursorStyle(), touchAction: "none" }}
            data-testid="canvas-whiteboard"
          />
          {!connected && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none">
              <span className="text-xs bg-yellow-100 text-yellow-800 border border-yellow-300 px-2 py-1 rounded-full animate-pulse">
                Reconnecting…
              </span>
            </div>
          )}
          <div className="absolute bottom-1 left-1 pointer-events-none">
            <span className="text-[10px] bg-black/40 text-white px-1.5 py-0.5 rounded font-mono" data-testid="text-wb-debug">
              {connected ? "WS:ON" : "WS:OFF"} | Strokes:{wbActions.length} | {wbCanvasRef.current?.width ?? 0}x{wbCanvasRef.current?.height ?? 0}
            </span>
          </div>
        </div>
      </div>

      {/* Chat + participants panel */}
      <div className={cn("w-72 flex-shrink-0 flex flex-col border-l bg-background", !showChat && "hidden md:flex")}>
        {/* Participants */}
        <div className="p-3 border-b">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
            <Users className="w-3 h-3" /> Participants ({participants.length})
          </p>
          <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
            {participants.map(p => (
              <div key={p.userId} className="flex items-center gap-1 text-xs bg-muted rounded-full px-2 py-0.5">
                <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", p.role === "tutor" ? "bg-amber-500" : "bg-green-500")} />
                <span className="truncate max-w-[80px]">{p.username}</span>
                {p.userId === remoteMicUserId && <Mic className="w-2.5 h-2.5 text-green-600" />}
              </div>
            ))}
            {participants.length === 0 && <p className="text-xs text-muted-foreground italic">Waiting for participants…</p>}
          </div>
        </div>

        {/* Chat */}
        <ScrollArea className="flex-1 p-3">
          <div className="space-y-2">
            {chatMessages.map((msg, i) => (
              <div key={i} className={cn("flex gap-2", msg.userId === user?.id && "flex-row-reverse")}>
                <Avatar className="h-6 w-6 flex-shrink-0">
                  <AvatarFallback className="text-[10px]">{msg.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className={cn(
                  "max-w-[80%] rounded-xl px-3 py-1.5 text-sm leading-snug break-words",
                  msg.userId === user?.id ? "bg-primary text-primary-foreground" : "bg-muted"
                )}>
                  {msg.userId !== user?.id && <p className="text-[10px] font-semibold mb-0.5 opacity-70">{msg.username}</p>}
                  {msg.content}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </ScrollArea>

        <div className="p-3 border-t">
          <form onSubmit={e => { e.preventDefault(); sendChatMessage(); }} className="flex gap-2">
            <Input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder={connected ? "Message class…" : "Reconnecting…"}
              disabled={!connected}
              className="text-sm"
              data-testid="input-chat-message"
            />
            <Button type="submit" size="icon" disabled={!chatInput.trim() || !connected} data-testid="button-send-chat">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
