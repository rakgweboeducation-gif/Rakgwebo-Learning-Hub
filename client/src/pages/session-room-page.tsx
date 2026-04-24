import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../hooks/use-auth";
import { useSessionWebSocket } from "../hooks/use-session-ws";
import { useLocation } from "wouter";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { ScrollArea } from "../components/ui/scroll-area";
import { Slider } from "../components/ui/slider";
import { useToast } from "../hooks/use-toast";
import { cn } from "../lib/utils";
import { apiRequest } from "../lib/queryClient";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, MessageSquare,
  Pencil, Eraser, Undo2, Redo2, Trash2, Circle, Square,
  Minus, Send, BookOpen, ChevronLeft, ChevronRight, Users,
  Maximize2, Minimize2, MonitorPlay, Timer, CreditCard,
  Upload, FileImage, Move, ZoomIn, ZoomOut, RotateCcw, MousePointer2
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { apiUrl } from "../lib/api-config";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

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
  type: WBTool | "image";
  color: string;
  lineWidth: number;
  points?: { x: number; y: number }[];
  startX?: number; startY?: number; endX?: number; endY?: number;
  userId?: number;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
};

type SessionMessage = {
  id: number;
  userId: number;
  username: string;
  content: string;
  timestamp: number;
};

type ViewMode = "whiteboard" | "textbook" | "split";

interface SessionRoomPageProps {
  sessionId: string;
}

export default function SessionRoomPage({ sessionId }: SessionRoomPageProps) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const sid = parseInt(sessionId);

  const { connected, participants, send, sendBinary, on, onBinary } = useSessionWebSocket(
    sid, user?.id ?? null, user?.username ?? null
  );

  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("whiteboard");
  const [fullscreen, setFullscreen] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const wbCanvasRef = useRef<HTMLCanvasElement>(null);
  const wbContainerRef = useRef<HTMLDivElement>(null);
  const [wbTool, setWbTool] = useState<WBTool>("pen");
  const wbToolRef = useRef<WBTool>("pen");
  wbToolRef.current = wbTool;
  const [wbColor, setWbColor] = useState("#000000");
  const wbColorRef = useRef("#000000");
  wbColorRef.current = wbColor;
  const [wbLineWidth, setWbLineWidth] = useState(3);
  const wbLineWidthRef = useRef(3);
  wbLineWidthRef.current = wbLineWidth;
  const [wbActions, setWbActions] = useState<WBAction[]>([]);
  const [wbRedoStack, setWbRedoStack] = useState<WBAction[]>([]);
  const wbActionsRef = useRef<WBAction[]>([]);
  wbActionsRef.current = wbActions;
  const isDrawingRef = useRef(false);
  const currentActionRef = useRef<WBAction | null>(null);
  const needsRedrawRef = useRef(true);
  const drawBufferRef = useRef<{ x: number; y: number }[]>([]);
  const drawStreamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const strokeIdRef = useRef(0);
  const currentStrokeIdRef = useRef("");
  const remoteStrokesRef = useRef<Map<string, { tool: string; color: string; lineWidth: number; points: { x: number; y: number }[] }>>(new Map());
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [zoom, setZoom] = useState(1);
  const panXRef = useRef(0);
  const panYRef = useRef(0);
  const zoomRef = useRef(1);
  panXRef.current = panX;
  panYRef.current = panY;
  const panStateRafRef = useRef<number | null>(null);
  const flushPanState = useCallback(() => {
    if (panStateRafRef.current !== null) return;
    panStateRafRef.current = requestAnimationFrame(() => {
      setPanX(panXRef.current); setPanY(panYRef.current);
      panStateRafRef.current = null;
    });
  }, []);
  zoomRef.current = zoom;
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  // Multi-touch pinch-to-zoom
  // Image selection / resize
  const selectedImageIdRef = useRef<string | null>(null);
  type ResizeSel = { actionIdx: number; handle: string; startX: number; startY: number; origX1: number; origY1: number; origW: number; origH: number };
  const resizeSelRef = useRef<ResizeSel | null>(null);
  const [selTick, setSelTick] = useState(0);
  const wbImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const wbFileInputRef = useRef<HTMLInputElement>(null);
  const wbDocInputRef = useRef<HTMLInputElement>(null);

  const [tbTextbookId, setTbTextbookId] = useState<number | null>(null);
  const [tbTitle, setTbTitle] = useState("");
  const [tbPage, setTbPage] = useState(1);
  const [tbTotalPages, setTbTotalPages] = useState(0);
  const tbCanvasRef = useRef<HTMLCanvasElement>(null);
  const tbPdfRef = useRef<any>(null);
  const tbSuppressSyncRef = useRef(false);

  // Recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const isRecordingRef = useRef(false);
  const stopAndUploadRecordingRef = useRef<((sessionId: number) => Promise<void>) | null>(null);

  const [chatMessages, setChatMessages] = useState<SessionMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const msgIdRef = useRef(0);

  const [textbooks, setTextbooks] = useState<any[]>([]);
  const [showTextbookPicker, setShowTextbookPicker] = useState(false);

  const [sessionPayment, setSessionPayment] = useState<any>(null);
  const [sessionPaymentLoading, setSessionPaymentLoading] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const sessionStartRef = useRef<number | null>(null);
  const sessionEndTimeRef = useRef<number | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);

  useEffect(() => {
    fetch(apiUrl("/api/textbooks"), { credentials: "include" })
      .then(r => r.json())
      .then(setTextbooks)
      .catch(() => {});
    fetch(apiUrl(`/api/payments/session/${sid}`), { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSessionPayment(data); })
      .catch(() => {})
      .finally(() => setSessionPaymentLoading(false));
    fetch(apiUrl(`/api/tutor-sessions/${sid}`), { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.startTime) {
          sessionStartRef.current = new Date(data.startTime).getTime();
        } else {
          sessionStartRef.current = Date.now();
        }
        if (data?.endTime) {
          sessionEndTimeRef.current = new Date(data.endTime).getTime();
        }
      })
      .catch(() => { sessionStartRef.current = Date.now(); });
  }, [sid]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (sessionStartRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - sessionStartRef.current) / 1000));
      }
      if (sessionEndTimeRef.current && Date.now() >= sessionEndTimeRef.current && !sessionEnded) {
        setSessionEnded(true);
        const currentElapsed = sessionStartRef.current
          ? Math.floor((Date.now() - sessionStartRef.current) / 1000)
          : 0;
        toast({ title: "Session time has ended", description: "Processing payment and closing session..." });
        (async () => {
          try {
            const sessionId = sid;
            const paymentRes = await fetch(apiUrl(`/api/payments/session/${sessionId}`), { credentials: "include" });
            if (paymentRes.ok) {
              const payment = await paymentRes.json();
              if (payment && payment.status === "authorized") {
                const actualMinutes = Math.max(1, Math.floor(currentElapsed / 60));
                const captureRes = await apiRequest("POST", `/api/payments/${payment.id}/capture`, {
                  actualDurationMinutes: actualMinutes,
                });
                if (captureRes.ok) {
                  const captured = await captureRes.json();
                  toast({
                    title: "Payment processed",
                    description: `R${(captured.amount / 100).toFixed(2)} captured for ${actualMinutes} minute(s)`,
                  });
                }
              }
            }
          } catch (err) {
            console.error("[Session] Auto-end payment capture failed:", err);
          }
          stopAndUploadRecordingRef.current?.(sid).finally(() => {
            localStreamRef.current?.getTracks().forEach(t => t.stop());
            navigate("/schedule");
          });
          setTimeout(() => { localStreamRef.current?.getTracks().forEach(t => t.stop()); }, 2000);
        })();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionEnded, toast, navigate]);

  // ========== Session Recording ==========
  const startRecording = useCallback((stream: MediaStream) => {
    if (isRecordingRef.current) return;
    try {
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "video/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      recordingChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };
      recorder.start(5000);
      mediaRecorderRef.current = recorder;
      recordingStartTimeRef.current = Date.now();
      isRecordingRef.current = true;
    } catch (err) {
      console.warn("[Recording] Could not start recording:", err);
    }
  }, []);

  const stopAndUploadRecording = useCallback(async (sessionId: number): Promise<void> => { // ref kept in sync below
    const recorder = mediaRecorderRef.current;
    if (!recorder || !isRecordingRef.current) return;
    isRecordingRef.current = false;
    return new Promise((resolve) => {
      recorder.onstop = async () => {
        try {
          const chunks = recordingChunksRef.current;
          if (chunks.length === 0) return resolve();
          const mimeType = recorder.mimeType || "video/webm";
          const blob = new Blob(chunks, { type: mimeType });
          const durationSeconds = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
          const ext = mimeType.includes("mp4") ? ".mp4" : ".webm";
          const file = new File([blob], `session-${sessionId}${ext}`, { type: mimeType });
          const formData = new FormData();
          formData.append("recording", file);
          formData.append("durationSeconds", String(durationSeconds));
          await fetch(`/api/tutor-sessions/${sessionId}/recording`, {
            method: "POST",
            credentials: "include",
            body: formData,
          });
        } catch (err) {
          console.warn("[Recording] Upload failed:", err);
        } finally {
          resolve();
        }
      };
      recorder.stop();
    });
  }, []);
  stopAndUploadRecordingRef.current = stopAndUploadRecording;

  // ========== Mic Relay via WebSocket binary frames ==========
  const micStreamRef = useRef<MediaStream | null>(null);
  const micRecorderRef = useRef<MediaRecorder | null>(null);
  const micEnabledRef = useRef(true);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const msRef = useRef<MediaSource | null>(null);
  const sbRef = useRef<SourceBuffer | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);

  const drainAudioQueue = useCallback(() => {
    const sb = sbRef.current;
    if (!sb || sb.updating || audioQueueRef.current.length === 0) return;
    try { sb.appendBuffer(audioQueueRef.current.shift()!); } catch { audioQueueRef.current = []; }
  }, []);

  const initRemoteAudio = useCallback((mimeType: string) => {
    if (msRef.current) return;
    if (!MediaSource.isTypeSupported(mimeType)) {
      console.warn('[Audio] MediaSource type not supported:', mimeType);
      return;
    }
    const ms = new MediaSource();
    msRef.current = ms;
    const audio = document.createElement('audio');
    audio.style.display = 'none';
    audio.src = URL.createObjectURL(ms);
    document.body.appendChild(audio);
    remoteAudioRef.current = audio;
    ms.addEventListener('sourceopen', () => {
      try {
        const sb = ms.addSourceBuffer(mimeType);
        sbRef.current = sb;
        sb.addEventListener('updateend', drainAudioQueue);
        audio.play().catch(e => console.warn('[Audio] play blocked:', e));
      } catch (e) { console.warn('[Audio] addSourceBuffer failed:', e); }
    });
  }, [drainAudioQueue]);

  const startMicRelay = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      if (!mimeType) { console.warn('[Mic] No supported mimeType'); return; }
      // Tell the other side what MIME type to expect
      send({ type: 'audio-mime', mimeType });
      const recorder = new MediaRecorder(stream, { mimeType });
      micRecorderRef.current = recorder;
      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0 && micEnabledRef.current) {
          sendBinary(await e.data.arrayBuffer());
        }
      };
      recorder.start(200);
    } catch (err) {
      console.error('[Mic] getUserMedia failed:', err);
      toast({ title: 'Could not access microphone', description: 'Please check permissions', variant: 'destructive' });
    }
  }, [send, sendBinary, toast]);

  const stopMicRelay = useCallback(() => {
    micRecorderRef.current?.stop();
    micRecorderRef.current = null;
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    send({ type: 'audio-stopped' });
  }, [send]);

  // Receive remote audio MIME type, then binary audio chunks
  const remoteMimeRef = useRef<string>('audio/webm;codecs=opus');
  useEffect(() => {
    const unsubMime = on('audio-mime', (msg: any) => {
      remoteMimeRef.current = msg.mimeType;
      initRemoteAudio(msg.mimeType);
    });
    const unsubStop = on('audio-stopped', () => {
      if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = null; }
    });
    return () => { unsubMime(); unsubStop(); };
  }, [on, initRemoteAudio]);

  useEffect(() => {
    const unsub = onBinary((data: ArrayBuffer) => {
      if (!msRef.current) initRemoteAudio(remoteMimeRef.current);
      audioQueueRef.current.push(data);
      drainAudioQueue();
    });
    return unsub;
  }, [onBinary, initRemoteAudio, drainAudioQueue]);

  // Camera-only media (no audio — mic is separate)
  const setupCameraMedia = useCallback(async () => {
    if (!camEnabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    } catch (err) {
      console.error('[Session] Camera access failed:', err);
    }
  }, [camEnabled]);

  useEffect(() => {
    startMicRelay();
    return () => {
      stopMicRelay();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      remoteAudioRef.current?.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = () => {
    if (micEnabledRef.current) {
      // Mute: pause the recorder (tracks stay alive, just don't send)
      micEnabledRef.current = false;
      setMicEnabled(false);
    } else {
      // Unmute
      micEnabledRef.current = true;
      setMicEnabled(true);
      // If recorder stopped (e.g. first open), restart it
      if (!micRecorderRef.current || micRecorderRef.current.state === 'inactive') {
        startMicRelay();
      }
    }
  };

  const toggleCam = async () => {
    const stream = localStreamRef.current;
    if (camEnabled) {
      stream?.getVideoTracks().forEach(t => { t.stop(); stream.removeTrack(t); });
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      setCamEnabled(false);
    } else {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = videoStream.getVideoTracks()[0];
        if (!localStreamRef.current) localStreamRef.current = new MediaStream();
        localStreamRef.current.addTrack(videoTrack);
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
        setCamEnabled(true);
      } catch (err) {
        console.error('[Session] Camera access failed:', err);
      }
    }
  };

    const endSession = async () => {
    try {
      const paymentRes = await fetch(apiUrl(`/api/payments/session/${sid}`), { credentials: "include" });
      if (paymentRes.ok) {
        const payment = await paymentRes.json();
        if (payment && payment.status === "authorized") {
          const currentElapsed = sessionStartRef.current
            ? Math.floor((Date.now() - sessionStartRef.current) / 1000)
            : elapsedSeconds;
          const actualMinutes = Math.max(1, Math.floor(currentElapsed / 60));
          const captureRes = await apiRequest("POST", `/api/payments/${payment.id}/capture`, {
            actualDurationMinutes: actualMinutes,
          });
          if (captureRes.ok) {
            const captured = await captureRes.json();
            toast({
              title: "Payment processed",
              description: `R${(captured.amount / 100).toFixed(2)} captured for ${actualMinutes} minute(s)`,
            });
          }
        }
      }
    } catch (err) {
      console.error("[Session] Payment capture on end failed:", err);
    }

    await stopAndUploadRecording(sid);
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    navigate("/schedule");
  };

  // ========== Shared Whiteboard ==========
  const renderWhiteboard = useCallback(() => {
    const canvas = wbCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(panXRef.current, panYRef.current);
    ctx.scale(zoomRef.current, zoomRef.current);

    const allActions = currentActionRef.current
      ? [...wbActionsRef.current, currentActionRef.current]
      : wbActionsRef.current;

    for (const action of allActions) {
      if (action.type === "image" && action.imageUrl && action.startX !== undefined) {
        const cached = wbImageCacheRef.current.get(action.imageUrl);
        if (cached && cached.complete && cached.naturalWidth > 0) {
          ctx.drawImage(cached, action.startX, action.startY!, action.imageWidth || cached.naturalWidth, action.imageHeight || cached.naturalHeight);
        } else if (!cached) {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            wbImageCacheRef.current.set(action.imageUrl!, img);
            needsRedrawRef.current = true;
          };
          img.src = action.imageUrl;
          wbImageCacheRef.current.set(action.imageUrl, img);
        }
        continue;
      }

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = action.type === "eraser" ? "#ffffff" : action.color;
      ctx.lineWidth = action.type === "eraser" ? action.lineWidth * 3 : action.lineWidth;

      if ((action.type === "pen" || action.type === "eraser") && action.points && action.points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(action.points[0].x, action.points[0].y);
        for (let i = 1; i < action.points.length; i++) {
          ctx.lineTo(action.points[i].x, action.points[i].y);
        }
        ctx.stroke();
      } else if (action.type === "line" && action.startX !== undefined) {
        ctx.beginPath();
        ctx.moveTo(action.startX, action.startY!);
        ctx.lineTo(action.endX ?? action.startX, action.endY ?? action.startY!);
        ctx.stroke();
      } else if (action.type === "rectangle" && action.startX !== undefined) {
        const w = (action.endX ?? action.startX) - action.startX;
        const h = (action.endY ?? action.startY!) - action.startY!;
        ctx.strokeRect(action.startX, action.startY!, w, h);
      } else if (action.type === "circle" && action.startX !== undefined) {
        const dx = (action.endX ?? action.startX) - action.startX;
        const dy = (action.endY ?? action.startY!) - action.startY!;
        const radius = Math.sqrt(dx * dx + dy * dy);
        ctx.beginPath();
        ctx.arc(action.startX, action.startY!, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    for (const [, stroke] of remoteStrokesRef.current) {
      if (stroke.points.length < 2) continue;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = stroke.tool === "eraser" ? "#ffffff" : stroke.color;
      ctx.lineWidth = stroke.tool === "eraser" ? stroke.lineWidth * 3 : stroke.lineWidth;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }

    if (selectedImageIdRef.current) {
      const a = wbActionsRef.current.find(a => a.id === selectedImageIdRef.current);
      if (a && a.type === "image" && a.startX !== undefined && a.imageWidth && a.imageHeight) {
        const x = a.startX; const y = a.startY!;
        const w = a.imageWidth; const h = a.imageHeight;
        const hs = 10 / zoomRef.current;
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2 / zoomRef.current;
        ctx.setLineDash([6 / zoomRef.current, 3 / zoomRef.current]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        ctx.fillStyle = "#3b82f6";
        for (const c of [{ x, y }, { x: x + w, y }, { x, y: y + h }, { x: x + w, y: y + h }]) {
          ctx.fillRect(c.x - hs / 2, c.y - hs / 2, hs, hs);
        }
      }
    }

    ctx.restore();
  }, []);

  useEffect(() => {
    let animFrame: number;
    const loop = () => {
      if (needsRedrawRef.current) {
        needsRedrawRef.current = false;
        renderWhiteboard();
      }
      animFrame = requestAnimationFrame(loop);
    };
    animFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrame);
  }, [renderWhiteboard]);

  useEffect(() => { needsRedrawRef.current = true; }, [wbActions, panX, panY, zoom, selTick]);

  // ── Resize canvas to match container (re-runs when view mode changes) ──
  useEffect(() => {
    const container = wbContainerRef.current;
    const canvas = wbCanvasRef.current;
    if (!container || !canvas) return;
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
        needsRedrawRef.current = true;
      }
    });
    ro.observe(container);
    if (container.clientWidth > 0) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      needsRedrawRef.current = true;
    }
    return () => ro.disconnect();
  }, [viewMode]); // re-run when whiteboard becomes visible again

  // ── Canvas input: mouse + touch, move/up on window so they never miss ──
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

    const flushDrawBuffer = () => {
      if (drawBufferRef.current.length === 0) return;
      const pts = drawBufferRef.current.splice(0);
      const cur = currentActionRef.current;
      if (!cur) return;
      send({
        type: 'draw-stream',
        strokeId: currentStrokeIdRef.current,
        points: pts,
        tool: cur.type,
        color: cur.color,
        lineWidth: cur.lineWidth,
      });
    };

    const onBegin = (clientX: number, clientY: number) => {
      const tool = wbToolRef.current;
      const pt = getPt(clientX, clientY);
      if (tool === 'pan') {
        isPanningRef.current = true;
        panStartRef.current = { x: clientX, y: clientY, panX: panXRef.current, panY: panYRef.current };
        return;
      }
      isDrawingRef.current = true;
      const color = tool === 'eraser' ? '#ffffff' : wbColorRef.current;
      currentActionRef.current = (tool === 'pen' || tool === 'eraser')
        ? { type: tool as 'pen' | 'eraser', color, lineWidth: wbLineWidthRef.current, startX: pt.x, startY: pt.y, endX: pt.x, endY: pt.y, points: [pt] }
        : { type: tool as 'line' | 'rectangle' | 'circle', color, lineWidth: wbLineWidthRef.current, startX: pt.x, startY: pt.y, endX: pt.x, endY: pt.y };
      strokeIdRef.current++;
      currentStrokeIdRef.current = `${user?.id}-${strokeIdRef.current}`;
      drawBufferRef.current = [pt];
      if ((tool === 'pen' || tool === 'eraser') && !drawStreamTimerRef.current) {
        drawStreamTimerRef.current = setInterval(flushDrawBuffer, 33);
      }
      needsRedrawRef.current = true;
    };

    const onMove = (clientX: number, clientY: number) => {
      if (isPanningRef.current) {
        panXRef.current = panStartRef.current.panX + (clientX - panStartRef.current.x);
        panYRef.current = panStartRef.current.panY + (clientY - panStartRef.current.y);
        flushPanState();
        needsRedrawRef.current = true;
        return;
      }
      if (!isDrawingRef.current || !currentActionRef.current) return;
      const pt = getPt(clientX, clientY);
      const cur = currentActionRef.current;
      if (cur.type === 'pen' || cur.type === 'eraser') {
        cur.points!.push(pt);
        drawBufferRef.current.push(pt);
      } else {
        cur.endX = pt.x; cur.endY = pt.y;
      }
      needsRedrawRef.current = true;
    };

    const onEnd = () => {
      if (isPanningRef.current) { isPanningRef.current = false; return; }
      if (!isDrawingRef.current || !currentActionRef.current) return;
      isDrawingRef.current = false;
      const isPenOrEraser = currentActionRef.current.type === 'pen' || currentActionRef.current.type === 'eraser';
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
      setWbRedoStack([]);
      send({ type: 'whiteboard-action', action: finished });
      needsRedrawRef.current = true;
    };

    const onCancel = () => {
      isDrawingRef.current = false;
      isPanningRef.current = false;
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
        isDrawingRef.current = false;
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
  }, [send, user?.id]);

  useEffect(() => {
    const unsub1 = on("whiteboard-action", (msg: any) => {
      if (msg.fromUserId) {
        const prefix = `${msg.fromUserId}-`;
        for (const key of remoteStrokesRef.current.keys()) {
          if (key.startsWith(prefix)) remoteStrokesRef.current.delete(key);
        }
      }
      setWbActions(prev => [...prev, msg.action]);
      needsRedrawRef.current = true;
    });
    const unsub2 = on("whiteboard-clear", () => {
      setWbActions([]);
      setWbRedoStack([]);
      selectedImageIdRef.current = null;
      remoteStrokesRef.current.clear();
      needsRedrawRef.current = true;
    });
    const unsub3 = on("whiteboard-undo", () => {
      setWbActions(prev => prev.slice(0, -1));
      needsRedrawRef.current = true;
    });
    const unsub4 = on("whiteboard-update-image", (msg: any) => {
      setWbActions(prev => prev.map(a =>
        a.id === msg.id ? { ...a, startX: msg.x1, startY: msg.y1, imageWidth: msg.imageWidth, imageHeight: msg.imageHeight } : a
      ));
      needsRedrawRef.current = true;
    });
    const unsub5 = on("draw-stream", (msg: any) => {
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
    });
    const unsub6 = on("draw-end", (msg: any) => {
      remoteStrokesRef.current.delete(msg.strokeId);
      needsRedrawRef.current = true;
    });
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6(); };
  }, [on]);

  const wbUndo = () => {
    if (wbActions.length === 0) return;
    const last = wbActions[wbActions.length - 1];
    setWbActions(prev => prev.slice(0, -1));
    setWbRedoStack(prev => [...prev, last]);
    send({ type: "whiteboard-undo" });
  };

  const wbRedo = () => {
    if (wbRedoStack.length === 0) return;
    const last = wbRedoStack[wbRedoStack.length - 1];
    setWbRedoStack(prev => prev.slice(0, -1));
    setWbActions(prev => [...prev, last]);
    send({ type: "whiteboard-action", action: last });
  };

  const wbClear = () => {
    setWbActions([]);
    setWbRedoStack([]);
    selectedImageIdRef.current = null;
    send({ type: "whiteboard-clear" });
  };

  // ========== Textbook Viewer ==========
  const loadTextbook = useCallback(async (textbookId: number, title: string) => {
    try {
      const res = await fetch(apiUrl(`/api/textbooks`), { credentials: "include" });
      const books = await res.json();
      const book = books.find((b: any) => b.id === textbookId);
      if (!book) return;

      const pdf = await pdfjsLib.getDocument(book.url).promise;
      tbPdfRef.current = pdf;
      setTbTextbookId(textbookId);
      setTbTitle(title || book.title);
      setTbTotalPages(pdf.numPages);
      setTbPage(1);
      renderTbPage(pdf, 1);
    } catch (err) {
      console.error("[Session] Failed to load textbook:", err);
    }
  }, []);

  const renderTbPage = async (pdf: any, pageNum: number) => {
    const canvas = tbCanvasRef.current;
    if (!canvas || !pdf) return;
    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (err) {
      console.error("[Session] Failed to render page:", err);
    }
  };

  const goToTbPage = (page: number) => {
    if (!tbPdfRef.current || !tbTextbookId || page < 1 || page > tbTotalPages) return;
    setTbPage(page);
    renderTbPage(tbPdfRef.current, page);
    if (!tbSuppressSyncRef.current) {
      send({ type: "textbook-sync", textbookId: tbTextbookId, page });
    }
    tbSuppressSyncRef.current = false;
  };

  const openTextbook = (textbookId: number, title: string) => {
    loadTextbook(textbookId, title);
    send({ type: "textbook-open", textbookId, title });
    setViewMode("textbook");
    setShowTextbookPicker(false);
  };

  useEffect(() => {
    const unsub1 = on("textbook-open", (msg: any) => {
      loadTextbook(msg.textbookId, msg.title);
      setViewMode("textbook");
    });
    const unsub2 = on("textbook-sync", (msg: any) => {
      if (tbPdfRef.current && msg.textbookId === tbTextbookId) {
        tbSuppressSyncRef.current = true;
        setTbPage(msg.page);
        renderTbPage(tbPdfRef.current, msg.page);
      }
    });
    return () => { unsub1(); unsub2(); };
  }, [on, loadTextbook, tbTextbookId]);

  // ========== Room State Sync (late joiner gets board + textbook state) ==========
  useEffect(() => {
    const unsub = on("room-state", (msg: any) => {
      setWbActions(msg.whiteboardActions || []);
      needsRedrawRef.current = true;
      if (msg.textbook) {
        loadTextbook(msg.textbook.textbookId, msg.textbook.title);
        setTbPage(msg.textbook.page);
      }
    });
    return unsub;
  }, [on, loadTextbook]);

  // ========== Full reset on WebSocket reconnect ==========
  useEffect(() => {
    const unsub = on("_reconnected", () => {
      console.log("[SessionWS] Reconnected — performing full session reset");

      setWbActions([]);
      remoteStrokesRef.current.clear();
      needsRedrawRef.current = true;
      setChatMessages([]);

      if (msRef.current) {
        try { msRef.current.endOfStream(); } catch {}
        msRef.current = null;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.pause();
        remoteAudioRef.current.srcObject = null;
        remoteAudioRef.current.remove();
        remoteAudioRef.current = null;
      }
      sbRef.current = null;
      audioQueueRef.current = [];

      if (micRecorderRef.current && micRecorderRef.current.state !== 'inactive') {
        try { micRecorderRef.current.stop(); } catch {}
      }
      micRecorderRef.current = null;

      if (micEnabledRef.current) {
        if (micStreamRef.current) {
          const tracksAlive = micStreamRef.current.getTracks().some(t => t.readyState === 'live');
          if (!tracksAlive) {
            micStreamRef.current.getTracks().forEach(t => t.stop());
            micStreamRef.current = null;
          }
        }
        setTimeout(() => startMicRelay(), 500);
      }
    });
    return unsub;
  }, [on, startMicRelay]);

  // ========== In-Session Chat ==========
  const sendChatMessage = () => {
    if (!chatInput.trim() || !user) return;
    const msg: SessionMessage = {
      id: ++msgIdRef.current,
      userId: user.id,
      username: user.username,
      content: chatInput.trim(),
      timestamp: Date.now(),
    };
    setChatMessages(prev => [...prev, msg]);
    send({ type: "chat-message", content: chatInput.trim() });
    setChatInput("");
  };

  useEffect(() => {
    const unsub = on("chat-message", (msg: any) => {
      setChatMessages(prev => [...prev, {
        id: ++msgIdRef.current,
        userId: msg.userId,
        username: msg.username,
        content: msg.content,
        timestamp: msg.timestamp,
      }]);
    });
    return unsub;
  }, [on]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleWbImageUpload = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(apiUrl("/api/whiteboard/upload"), { method: "POST", credentials: "include", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        wbImageCacheRef.current.set(url, img);
        const maxW = 800;
        const scale = img.width > maxW ? maxW / img.width : 1;
        const viewX = (0 - panXRef.current) / zoomRef.current + 50;
        const viewY = (0 - panYRef.current) / zoomRef.current + 50;
        const action: WBAction = {
          id: crypto.randomUUID(),
          type: "image", color: "", lineWidth: 0,
          imageUrl: url, startX: viewX, startY: viewY,
          imageWidth: img.width * scale, imageHeight: img.height * scale,
          userId: user?.id,
        };
        setWbActions(prev => [...prev, action]);
        setWbRedoStack([]);
        send({ type: "whiteboard-action", action });
        needsRedrawRef.current = true;
      };
      img.src = url;
    } catch (err) {
      toast({ title: "Upload failed", variant: "destructive" });
    }
  };

  const handleWbDocUpload = async (file: File) => {
    if (file.type === "application/pdf") {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });
        const offCanvas = document.createElement("canvas");
        offCanvas.width = viewport.width;
        offCanvas.height = viewport.height;
        const offCtx = offCanvas.getContext("2d");
        if (!offCtx) return;
        await page.render({ canvasContext: offCtx, canvas: offCanvas, viewport }).promise;
        offCanvas.toBlob(async (blob) => {
          if (!blob) return;
          const pdfFile = new File([blob], "page.png", { type: "image/png" });
          await handleWbImageUpload(pdfFile);
        }, "image/png");
      } catch (err) {
        toast({ title: "Failed to process PDF", variant: "destructive" });
      }
    } else {
      await handleWbImageUpload(file);
    }
  };

  const resetView = () => {
    setPanX(0);
    setPanY(0);
    setZoom(1);
    panXRef.current = 0;
    panYRef.current = 0;
    zoomRef.current = 1;
    needsRedrawRef.current = true;
  };

  const zoomIn = () => {
    const newZoom = Math.min(zoom * 1.2, 5);
    const canvas = wbCanvasRef.current;
    if (canvas) {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const newPanX = cx - (cx - panXRef.current) * (newZoom / zoomRef.current);
      const newPanY = cy - (cy - panYRef.current) * (newZoom / zoomRef.current);
      panXRef.current = newPanX;
      panYRef.current = newPanY;
      setPanX(newPanX);
      setPanY(newPanY);
    }
    zoomRef.current = newZoom;
    setZoom(newZoom);
    needsRedrawRef.current = true;
  };

  const zoomOut = () => {
    const newZoom = Math.max(zoom / 1.2, 0.1);
    const canvas = wbCanvasRef.current;
    if (canvas) {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const newPanX = cx - (cx - panXRef.current) * (newZoom / zoomRef.current);
      const newPanY = cy - (cy - panYRef.current) * (newZoom / zoomRef.current);
      panXRef.current = newPanX;
      panYRef.current = newPanY;
      setPanX(newPanX);
      setPanY(newPanY);
    }
    zoomRef.current = newZoom;
    setZoom(newZoom);
    needsRedrawRef.current = true;
  };

  const WB_COLORS = ["#000000", "#ef4444", "#3b82f6", "#22c55e", "#f97316", "#8b5cf6", "#ffffff"];

  if (!user) return null;

  const otherParticipant = participants.find(p => p.userId !== user.id);

  return (
    <div className={cn("flex flex-col h-screen bg-background", fullscreen && "fixed inset-0 z-50")} data-testid="session-room">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-card border-b shrink-0">
        <div className="flex items-center gap-3">
          <Badge variant={connected ? "default" : "destructive"} className="text-xs">
            {connected ? "Connected" : "Reconnecting..."}
          </Badge>
          <div className="flex items-center gap-1">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{participants.length}</span>
          </div>
          {otherParticipant && (
            <span className="text-sm font-medium">{otherParticipant.username} is in the session</span>
          )}
          <div className="flex items-center gap-1 ml-2 px-2 py-1 rounded bg-muted" data-testid="session-timer">
            <Timer className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-mono tabular-nums">
              {String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0')}:{String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, '0')}:{String(elapsedSeconds % 60).padStart(2, '0')}
            </span>
          </div>
          {sessionPayment && (
            <Badge variant="outline" className="ml-1 text-xs gap-1" data-testid="payment-badge">
              <CreditCard className="w-3 h-3" />
              R{(sessionPayment.amount / 100).toFixed(2)} held
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={viewMode === "whiteboard" ? "default" : "outline"} onClick={() => setViewMode("whiteboard")} data-testid="button-view-whiteboard">
            <Pencil className="w-4 h-4 mr-1" /> Whiteboard
          </Button>
          <Button size="sm" variant={viewMode === "textbook" ? "default" : "outline"} onClick={() => { if (tbTextbookId) setViewMode("textbook"); else setShowTextbookPicker(true); }} data-testid="button-view-textbook">
            <BookOpen className="w-4 h-4 mr-1" /> Textbook
          </Button>
          <Button size="sm" variant={viewMode === "split" ? "default" : "outline"} onClick={() => setViewMode("split")} data-testid="button-view-split">
            <MonitorPlay className="w-4 h-4 mr-1" /> Split
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setFullscreen(f => !f)}>
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Video Strip */}
          <div className="flex items-center gap-2 p-2 bg-muted/50 shrink-0">
            <div className="relative w-32 h-24 bg-black rounded-lg overflow-hidden">
              <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" data-testid="local-video" />
              {!camEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-800 text-white text-xs">
                  <VideoOff className="w-5 h-5" />
                </div>
              )}
              <Badge className="absolute bottom-1 left-1 text-[10px] py-0 px-1">You</Badge>
            </div>
            <div className="relative w-32 h-24 bg-black rounded-lg overflow-hidden">
              <div className="w-full h-full flex items-center justify-center bg-muted/30" data-testid="remote-audio-indicator"><div className="text-xs text-muted-foreground">Audio only</div></div>
              {!otherParticipant && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-800 text-white text-xs">
                  Waiting...
                </div>
              )}
              {otherParticipant && (
                <Badge className="absolute bottom-1 left-1 text-[10px] py-0 px-1">{otherParticipant.username}</Badge>
              )}
            </div>
          </div>

          {/* Whiteboard / Textbook Area */}
          <div className="flex-1 flex overflow-hidden">
            {/* Whiteboard panel — always mounted so canvas listeners never die */}
            <div className={cn(
              "flex flex-col overflow-hidden",
              viewMode === "textbook" ? "hidden" : viewMode === "split" ? "w-1/2 border-r" : "flex-1"
            )}>
                {/* Whiteboard Toolbar */}
                <div className="flex items-center gap-1 p-2 bg-card border-b flex-wrap shrink-0">
                  {([
                    { tool: "select" as WBTool, icon: MousePointer2, label: "Select / Resize" },
                    { tool: "pen" as WBTool, icon: Pencil, label: "Pen" },
                    { tool: "eraser" as WBTool, icon: Eraser, label: "Eraser" },
                    { tool: "line" as WBTool, icon: Minus, label: "Line" },
                    { tool: "rectangle" as WBTool, icon: Square, label: "Rectangle" },
                    { tool: "circle" as WBTool, icon: Circle, label: "Circle" },
                    { tool: "pan" as WBTool, icon: Move, label: "Pan" },
                  ]).map(({ tool, icon: Icon, label }) => (
                    <Button key={tool} size="icon" variant={wbTool === tool ? "default" : "ghost"} onClick={() => setWbTool(tool)} title={label} className="h-8 w-8" data-testid={`button-wb-${tool}`}>
                      <Icon className="w-4 h-4" />
                    </Button>
                  ))}
                  <div className="w-px h-6 bg-border mx-1" />
                  {WB_COLORS.map(c => (
                    <button key={c} className={cn("w-6 h-6 rounded-full border-2 shrink-0", wbColor === c ? "border-primary ring-2 ring-primary/30" : "border-muted")} style={{ backgroundColor: c }} onClick={() => setWbColor(c)} data-testid={`button-wb-color-${c}`} />
                  ))}
                  <div className="w-px h-6 bg-border mx-1" />
                  <div className="w-20">
                    <Slider value={[wbLineWidth]} onValueChange={([v]) => setWbLineWidth(v)} min={1} max={12} step={1} />
                  </div>
                  <div className="w-px h-6 bg-border mx-1" />
                  <Button size="icon" variant="ghost" onClick={wbUndo} title="Undo" className="h-8 w-8" data-testid="button-wb-undo">
                    <Undo2 className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={wbRedo} title="Redo" className="h-8 w-8" data-testid="button-wb-redo">
                    <Redo2 className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={wbClear} title="Clear" className="h-8 w-8" data-testid="button-wb-clear">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <div className="w-px h-6 bg-border mx-1" />
                  <input ref={wbFileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) { handleWbImageUpload(e.target.files[0]); e.target.value = ""; } }} />
                  <Button size="icon" variant="ghost" onClick={() => wbFileInputRef.current?.click()} title="Upload Image" className="h-8 w-8" data-testid="button-wb-upload-image">
                    <FileImage className="w-4 h-4" />
                  </Button>
                  <input ref={wbDocInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.gif,.bmp,.webp" className="hidden" onChange={e => { if (e.target.files?.[0]) { handleWbDocUpload(e.target.files[0]); e.target.value = ""; } }} />
                  <Button size="icon" variant="ghost" onClick={() => wbDocInputRef.current?.click()} title="Upload Document" className="h-8 w-8" data-testid="button-wb-upload-doc">
                    <Upload className="w-4 h-4" />
                  </Button>
                  <div className="w-px h-6 bg-border mx-1" />
                  <Button size="icon" variant="ghost" onClick={zoomOut} title="Zoom Out" className="h-8 w-8" data-testid="button-wb-zoom-out">
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground min-w-[40px] text-center tabular-nums" data-testid="text-zoom-level">{Math.round(zoom * 100)}%</span>
                  <Button size="icon" variant="ghost" onClick={zoomIn} title="Zoom In" className="h-8 w-8" data-testid="button-wb-zoom-in">
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={resetView} title="Reset View" className="h-8 w-8" data-testid="button-wb-reset-view">
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                </div>
                {/* Canvas */}
                <div ref={wbContainerRef} className="flex-1 overflow-hidden bg-white relative">
                  <canvas
                  ref={wbCanvasRef}
                  className="absolute inset-0 w-full h-full"
                  style={{
                    touchAction: "none",
                    cursor: wbTool === "pan" ? (isPanningRef.current ? "grabbing" : "grab")
                      : wbTool === "select" ? "default"
                      : wbTool === "eraser" ? "cell" : "crosshair",
                  }}
                  data-testid="whiteboard-canvas"
                />
                </div>
              </div>

            {/* Textbook panel — always mounted so PDF state is preserved */}
            <div className={cn(
              "flex flex-col overflow-hidden",
              viewMode === "whiteboard" ? "hidden" : viewMode === "split" ? "w-1/2" : "flex-1"
            )}>
                {tbTextbookId ? (
                  <>
                    <div className="flex items-center justify-between p-2 bg-card border-b shrink-0">
                      <span className="text-sm font-medium truncate">{tbTitle}</span>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => goToTbPage(tbPage - 1)} disabled={tbPage <= 1} data-testid="button-tb-prev">
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="text-sm min-w-[60px] text-center">{tbPage} / {tbTotalPages}</span>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => goToTbPage(tbPage + 1)} disabled={tbPage >= tbTotalPages} data-testid="button-tb-next">
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setShowTextbookPicker(true)} data-testid="button-tb-change">
                          Change
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="flex-1">
                      <div className="flex justify-center p-2">
                        <canvas ref={tbCanvasRef} className="max-w-full shadow-md" data-testid="textbook-canvas" />
                      </div>
                    </ScrollArea>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-4">
                      <BookOpen className="w-16 h-16 text-muted-foreground/30 mx-auto" />
                      <p className="text-muted-foreground">No textbook open</p>
                      <Button onClick={() => setShowTextbookPicker(true)} data-testid="button-open-textbook">
                        Open Textbook
                      </Button>
                    </div>
                  </div>
                )}
              </div>
          </div>
        </div>

        {/* Chat Sidebar */}
        {showChat && (
          <div className="w-80 border-l flex flex-col bg-card shrink-0">
            <div className="p-3 border-b flex items-center justify-between">
              <h3 className="font-semibold text-sm">Session Chat</h3>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowChat(false)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1 p-3">
              <div className="space-y-3">
                {chatMessages.map(msg => {
                  const isMine = msg.userId === user.id;
                  return (
                    <div key={msg.id} className={cn("flex flex-col", isMine ? "items-end" : "items-start")}>
                      <span className="text-[10px] text-muted-foreground mb-0.5">{msg.username}</span>
                      <div className={cn("rounded-lg px-3 py-1.5 text-sm max-w-[90%]", isMine ? "bg-primary text-primary-foreground" : "bg-muted")}>
                        {msg.content}
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
            </ScrollArea>
            <div className="p-2 border-t flex gap-2">
              <Input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message..." className="text-sm" onKeyDown={e => { if (e.key === "Enter") sendChatMessage(); }} data-testid="input-session-chat" />
              <Button size="icon" onClick={sendChatMessage} data-testid="button-send-session-chat">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="flex items-center justify-center gap-3 p-3 bg-card border-t shrink-0">
        <Button size="icon" variant={micEnabled ? "secondary" : "destructive"} onClick={toggleMic} className="h-12 w-12 rounded-full" data-testid="button-toggle-mic">
          {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </Button>
        <Button size="icon" variant={camEnabled ? "secondary" : "outline"} onClick={toggleCam} className="h-12 w-12 rounded-full" data-testid="button-toggle-cam">
          {camEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </Button>
        <Button size="icon" variant={showChat ? "default" : "outline"} onClick={() => setShowChat(!showChat)} className="h-12 w-12 rounded-full" data-testid="button-toggle-chat">
          <MessageSquare className="w-5 h-5" />
        </Button>
        <Button size="icon" variant="destructive" onClick={endSession} className="h-12 w-12 rounded-full" data-testid="button-end-session">
          <PhoneOff className="w-5 h-5" />
        </Button>
      </div>

      {/* Textbook Picker Modal */}
      {showTextbookPicker && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowTextbookPicker(false)}>
          <Card className="w-full max-w-md mx-4 p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Choose a Textbook</h3>
            <div className="space-y-2">
              {textbooks.map((tb: any) => (
                <button key={tb.id} className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted text-left transition-colors" onClick={() => openTextbook(tb.id, tb.title)} data-testid={`button-pick-textbook-${tb.id}`}>
                  <BookOpen className="w-8 h-8 text-primary shrink-0" />
                  <div>
                    <p className="font-medium text-sm">{tb.title}</p>
                    <p className="text-xs text-muted-foreground">Grade {tb.grade}</p>
                  </div>
                </button>
              ))}
              {textbooks.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No textbooks available</p>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
