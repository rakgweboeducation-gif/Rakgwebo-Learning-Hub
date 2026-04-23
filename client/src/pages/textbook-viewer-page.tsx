import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Maximize2, Minimize2, HelpCircle, X, Send,
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight,
  Pencil, Highlighter, Eraser, Square, Circle as CircleIcon,
  Undo2, Redo2, MousePointer2, Mic
} from "lucide-react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { VoiceRecorder } from "@/components/voice-recorder";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import * as pdfjsLib from "pdfjs-dist";
import type { Textbook, Annotation, User } from "@shared/schema";
import { apiUrl } from "@/lib/api-config";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type AnnotTool = "select" | "pen" | "highlighter" | "rectangle" | "circle" | "eraser";

type StrokePoint = { x: number; y: number };

type DrawStroke = {
  tool: AnnotTool;
  color: string;
  width: number;
  points: StrokePoint[];
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
};

const ANNOT_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#000000",
];

function drawStrokeOnCtx(ctx: CanvasRenderingContext2D, stroke: DrawStroke, scale: number) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (stroke.tool === "highlighter") {
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width * scale;
  } else if (stroke.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.lineWidth = stroke.width * scale * 3;
  } else {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width * scale;
  }

  if (stroke.tool === "rectangle" && stroke.startX != null && stroke.endX != null) {
    ctx.beginPath();
    ctx.rect(
      stroke.startX * scale, stroke.startY! * scale,
      (stroke.endX - stroke.startX) * scale, (stroke.endY! - stroke.startY!) * scale
    );
    ctx.stroke();
  } else if (stroke.tool === "circle" && stroke.startX != null && stroke.endX != null) {
    const cx = ((stroke.startX + stroke.endX) / 2) * scale;
    const cy = ((stroke.startY! + stroke.endY!) / 2) * scale;
    const rx = (Math.abs(stroke.endX - stroke.startX) / 2) * scale;
    const ry = (Math.abs(stroke.endY! - stroke.startY!) / 2) * scale;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (stroke.points.length > 0) {
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x * scale, stroke.points[0].y * scale);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x * scale, stroke.points[i].y * scale);
    }
    ctx.stroke();
  }

  ctx.restore();
}

export default function TextbookViewerPage({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const initialPage = parseInt(searchParams.get("page") || "1");
  const sharedByRaw = searchParams.get("sharedBy");
  const sharedByUserId = sharedByRaw && !isNaN(parseInt(sharedByRaw)) ? sharedByRaw : null;

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTool, setActiveTool] = useState<AnnotTool>("select");
  const [activeColor, setActiveColor] = useState("#ef4444");
  const [strokeWidth, setStrokeWidth] = useState(3);

  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const [undoStack, setUndoStack] = useState<DrawStroke[][]>([]);
  const [redoStack, setRedoStack] = useState<DrawStroke[][]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<DrawStroke | null>(null);

  const [showAskHelp, setShowAskHelp] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [helpMessage, setHelpMessage] = useState("");
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const voiceBlobRef = useRef<Blob | null>(null);
  const voiceDataRef = useRef<{ buffer: ArrayBuffer; type: string } | null>(null);
  const [isSendingHelp, setIsSendingHelp] = useState(false);

  const pdfDocRef = useRef<any>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const annotCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [pdfLoading, setPdfLoading] = useState(true);

  const savedAnnotsRef = useRef<Map<number, DrawStroke[]>>(new Map());
  const initialLoadDoneRef = useRef(false);

  const { data: textbooks } = useQuery<Textbook[]>({
    queryKey: ["/api/textbooks"],
  });

  const { data: dbAnnotations = [] } = useQuery<Annotation[]>({
    queryKey: ["/api/annotations", { textbookId: id }],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/annotations?textbookId=${id}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load annotations");
      return res.json();
    },
  });

  const { data: sharedAnnotations = [] } = useQuery<Annotation[]>({
    queryKey: ["/api/annotations", { textbookId: id, sharedBy: sharedByUserId }],
    enabled: !!sharedByUserId,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/annotations?textbookId=${id}&sharedBy=${sharedByUserId}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load shared annotations");
      return res.json();
    },
  });

  const sharedStrokesMap = useMemo(() => {
    const map = new Map<number, DrawStroke[]>();
    for (const ann of sharedAnnotations) {
      if (ann.type === "drawing") {
        try {
          map.set(ann.page, JSON.parse(ann.content) as DrawStroke[]);
        } catch {}
      }
    }
    return map;
  }, [sharedAnnotations]);

  const { data: searchResults = [] } = useQuery<Partial<User>[]>({
    queryKey: ["/api/chat/users/search", userSearch],
    enabled: userSearch.length >= 1 && showAskHelp,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/chat/users/search?q=${encodeURIComponent(userSearch)}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to search");
      return res.json();
    },
  });

  const textbook = textbooks?.find((t) => t.id === parseInt(id));

  useEffect(() => {
    if (dbAnnotations.length > 0 && !initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      const map = new Map<number, DrawStroke[]>();
      for (const ann of dbAnnotations) {
        if (ann.type === "drawing") {
          try {
            const parsed = JSON.parse(ann.content) as DrawStroke[];
            map.set(ann.page, parsed);
          } catch {}
        }
      }
      savedAnnotsRef.current = map;
      const pageStrokes = map.get(currentPage) || [];
      setStrokes(pageStrokes);
      setUndoStack([]);
      setRedoStack([]);
    }
  }, [dbAnnotations]);

  useEffect(() => {
    if (!textbook?.url) return;
    setPdfLoading(true);
    const loadPdf = async () => {
      try {
        const doc = await pdfjsLib.getDocument(textbook.url).promise;
        pdfDocRef.current = doc;
        setTotalPages(doc.numPages);
        renderPage(doc, currentPage);
      } catch (err) {
        console.error("Failed to load PDF:", err);
        setPdfLoading(false);
      }
    };
    loadPdf();
  }, [textbook?.url]);

  const renderPage = useCallback(async (doc: any, pageNum: number) => {
    if (!doc || !pdfCanvasRef.current) return;
    setPdfLoading(true);
    try {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 * zoom });
      const canvas = pdfCanvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setPageSize({ width: viewport.width, height: viewport.height });

      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport }).promise;

      if (annotCanvasRef.current) {
        annotCanvasRef.current.width = viewport.width;
        annotCanvasRef.current.height = viewport.height;
      }

      const pageStrokes = savedAnnotsRef.current.get(pageNum) || [];
      setStrokes(pageStrokes);
      setUndoStack([]);
      setRedoStack([]);
      setPdfLoading(false);
    } catch (err) {
      console.error("Failed to render page:", err);
      setPdfLoading(false);
    }
  }, [zoom]);

  useEffect(() => {
    if (pdfDocRef.current) {
      renderPage(pdfDocRef.current, currentPage);
    }
  }, [currentPage, zoom, renderPage]);

  useEffect(() => {
    redrawAnnotations();
  }, [strokes, pageSize, sharedStrokesMap, currentPage]);

  const redrawAnnotations = useCallback(() => {
    const canvas = annotCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sharedStrokes = sharedStrokesMap.get(currentPage) || [];
    for (const stroke of sharedStrokes) {
      drawStrokeOnCtx(ctx, stroke, 1);
    }
    for (const stroke of strokes) {
      drawStrokeOnCtx(ctx, stroke, 1);
    }
  }, [strokes, sharedStrokesMap, currentPage]);

  const saveAnnotationsForPage = useCallback(async (pageNum: number, pageStrokes: DrawStroke[]) => {
    savedAnnotsRef.current.set(pageNum, pageStrokes);
    const textbookId = parseInt(id);

    const sharedStrokes = sharedStrokesMap.get(pageNum) || [];
    const combinedStrokes = [...sharedStrokes, ...pageStrokes];

    const existingForPage = dbAnnotations.find(a => a.page === pageNum && a.type === "drawing");
    if (existingForPage) {
      try {
        await apiRequest("DELETE", `/api/annotations/${existingForPage.id}`);
      } catch {}
    }

    if (combinedStrokes.length > 0) {
      try {
        await apiRequest("POST", "/api/annotations", {
          textbookId,
          page: pageNum,
          content: JSON.stringify(combinedStrokes),
          type: "drawing",
          userId: 0,
        });
      } catch {}
    }
  }, [id, dbAnnotations, sharedStrokesMap]);

  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent): StrokePoint => {
    const canvas = annotCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX: number, clientY: number;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (activeTool === "select") return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    setIsDrawing(true);
    isDrawingRef.current = true;

    const newStroke: DrawStroke = {
      tool: activeTool,
      color: activeColor,
      width: activeTool === "highlighter" ? strokeWidth * 4 : strokeWidth,
      points: [pos],
    };

    if (activeTool === "rectangle" || activeTool === "circle") {
      newStroke.startX = pos.x;
      newStroke.startY = pos.y;
      newStroke.endX = pos.x;
      newStroke.endY = pos.y;
      newStroke.points = [];
    }

    currentStrokeRef.current = newStroke;
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    const stroke = currentStrokeRef.current;

    if (stroke.tool === "rectangle" || stroke.tool === "circle") {
      stroke.endX = pos.x;
      stroke.endY = pos.y;
    } else {
      stroke.points.push(pos);
    }

    const canvas = annotCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of strokes) {
      drawStrokeOnCtx(ctx, s, 1);
    }
    drawStrokeOnCtx(ctx, stroke, 1);
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    setIsDrawing(false);
    isDrawingRef.current = false;
    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = null;

    const hasContent =
      stroke.points.length > 1 ||
      (stroke.tool === "rectangle" && stroke.startX !== stroke.endX) ||
      (stroke.tool === "circle" && stroke.startX !== stroke.endX);

    if (hasContent) {
      setUndoStack(prev => [...prev, strokes]);
      setRedoStack([]);
      const newStrokes = [...strokes, stroke];
      setStrokes(newStrokes);
      saveAnnotationsForPage(currentPage, newStrokes);
    }
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(r => [...r, strokes]);
    setUndoStack(u => u.slice(0, -1));
    setStrokes(prev);
    saveAnnotationsForPage(currentPage, prev);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(u => [...u, strokes]);
    setRedoStack(r => r.slice(0, -1));
    setStrokes(next);
    saveAnnotationsForPage(currentPage, next);
  };

  const goToPage = (p: number) => {
    if (p >= 1 && p <= totalPages && p !== currentPage) {
      setCurrentPage(p);
      const url = new URL(window.location.href);
      url.searchParams.set("page", String(p));
      window.history.replaceState({}, "", url.toString());
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const capturePageSnapshot = (): string => {
    const pdfCanvas = pdfCanvasRef.current;
    const annotCanvas = annotCanvasRef.current;
    if (!pdfCanvas) return "";
    const combined = document.createElement("canvas");
    combined.width = pdfCanvas.width;
    combined.height = pdfCanvas.height;
    const ctx = combined.getContext("2d")!;
    ctx.drawImage(pdfCanvas, 0, 0);
    if (annotCanvas) {
      ctx.drawImage(annotCanvas, 0, 0);
    }
    return combined.toDataURL("image/png");
  };

  const handleAskForHelp = async (targetUser: Partial<User>) => {
    if (!textbook) return;
    setIsSendingHelp(true);
    try {
      const snapshot = capturePageSnapshot();
      let snapshotUrl = "";
      if (snapshot) {
        const blob = await (await fetch(snapshot)).blob();
        const formData = new FormData();
        formData.append("file", blob, `textbook-page-${currentPage}.png`);
        const uploadRes = await fetch(apiUrl("/api/chat/upload"), { method: "POST", body: formData, credentials: "include" });
        if (!uploadRes.ok) throw new Error("Failed to upload page snapshot");
        const { url } = await uploadRes.json();
        snapshotUrl = url;
      }

      let voiceUrl = "";
      const voiceData = voiceDataRef.current;
      const currentVoiceBlob = voiceBlobRef.current;
      console.log("[AskHelp] Voice data ref:", voiceData ? `${voiceData.buffer.byteLength} bytes` : "null");
      console.log("[AskHelp] Voice blob ref:", currentVoiceBlob?.size, "state:", voiceBlob?.size);

      if (voiceData && voiceData.buffer.byteLength > 0) {
        try {
          const ext = voiceData.type.includes("ogg") ? "ogg" : voiceData.type.includes("mp4") ? "mp4" : "webm";
          const freshBlob = new Blob([voiceData.buffer], { type: voiceData.type });
          console.log("[AskHelp] Created fresh blob from buffer:", freshBlob.size, "bytes");
          const vf = new FormData();
          vf.append("file", freshBlob, `help-voice-${Date.now()}.${ext}`);
          const vRes = await fetch(apiUrl("/api/chat/upload"), { method: "POST", body: vf, credentials: "include" });
          console.log("[AskHelp] Upload status:", vRes.status);
          if (!vRes.ok) {
            const errText = await vRes.text();
            console.error("[AskHelp] Voice upload failed:", vRes.status, errText);
            toast({ title: "Voice note upload failed", description: "Please try again", variant: "destructive" });
            setIsSendingHelp(false);
            return;
          }
          const vData = await vRes.json();
          voiceUrl = vData.url || "";
          console.log("[AskHelp] Voice uploaded:", voiceUrl);
          if (!voiceUrl) {
            toast({ title: "Voice note upload failed", description: "No URL returned", variant: "destructive" });
            setIsSendingHelp(false);
            return;
          }
        } catch (uploadErr) {
          console.error("[AskHelp] Voice upload error:", uploadErr);
          toast({ title: "Failed to upload voice note", description: String(uploadErr), variant: "destructive" });
          setIsSendingHelp(false);
          return;
        }
      } else if (currentVoiceBlob && currentVoiceBlob.size > 0) {
        try {
          const arrayBuf = await currentVoiceBlob.arrayBuffer();
          const freshBlob = new Blob([arrayBuf], { type: currentVoiceBlob.type || "audio/webm" });
          const vf = new FormData();
          vf.append("file", freshBlob, `help-voice-${Date.now()}.webm`);
          const vRes = await fetch(apiUrl("/api/chat/upload"), { method: "POST", body: vf, credentials: "include" });
          if (!vRes.ok) {
            toast({ title: "Voice note upload failed", description: "Please try again", variant: "destructive" });
            setIsSendingHelp(false);
            return;
          }
          const vData = await vRes.json();
          voiceUrl = vData.url || "";
          if (!voiceUrl) {
            toast({ title: "Voice note upload failed", description: "No URL returned", variant: "destructive" });
            setIsSendingHelp(false);
            return;
          }
        } catch (uploadErr) {
          console.error("[AskHelp] Fallback voice upload error:", uploadErr);
          toast({ title: "Failed to upload voice note", description: String(uploadErr), variant: "destructive" });
          setIsSendingHelp(false);
          return;
        }
      } else {
        console.log("[AskHelp] No voice note to upload");
      }

      const deepLink = `/textbooks/${id}?page=${currentPage}${currentUser ? `&sharedBy=${currentUser.id}` : ""}`;
      const msg = helpMessage.trim() || `I need help with this problem.`;
      const messageContent = `[Textbook Help Request]\n📖 ${textbook.title} (Grade ${textbook.grade})\n📄 Page ${currentPage}\n🔗 ${deepLink}\n\n${msg}`;

      const sessionRes = await apiRequest("POST", "/api/chat/sessions", { targetUserId: targetUser.id! });
      const session = await sessionRes.json();

      if (snapshotUrl) {
        await apiRequest("POST", `/api/chat/sessions/${session.id}/messages`, {
          content: messageContent,
          type: "image",
          mediaUrl: snapshotUrl,
        });
      } else {
        await apiRequest("POST", `/api/chat/sessions/${session.id}/messages`, {
          content: messageContent,
          type: "text",
        });
      }

      if (voiceUrl) {
        await apiRequest("POST", `/api/chat/sessions/${session.id}/messages`, {
          content: "Voice explanation",
          type: "audio",
          mediaUrl: voiceUrl,
        });
      }

      setShowAskHelp(false);
      setUserSearch("");
      setHelpMessage("");
      setVoiceBlob(null);
      voiceBlobRef.current = null;
      voiceDataRef.current = null;
      navigate(`/chat?session=${session.id}`);
    } catch (err) {
      console.error("Failed to send help request:", err);
    }
    setIsSendingHelp(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") {
        e.preventDefault();
        navigator.clipboard.writeText("").catch(() => {});
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
      }
    };

    const handleVisibilityChange = () => {
      const overlay = document.getElementById("screenshot-guard");
      if (overlay) {
        overlay.style.display = document.hidden ? "flex" : "none";
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-protected]")) {
        e.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("contextmenu", handleContextMenu);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  const tools: { tool: AnnotTool; icon: any; label: string }[] = [
    { tool: "select", icon: MousePointer2, label: "Select" },
    { tool: "pen", icon: Pencil, label: "Pen" },
    { tool: "highlighter", icon: Highlighter, label: "Highlighter" },
    { tool: "rectangle", icon: Square, label: "Rectangle" },
    { tool: "circle", icon: CircleIcon, label: "Circle" },
    { tool: "eraser", icon: Eraser, label: "Eraser" },
  ];

  if (!textbook) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 p-8">
        <p className="text-muted-foreground">Textbook not found or loading...</p>
        <Button variant="outline" onClick={() => navigate("/textbooks")} data-testid="button-back-textbooks">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Textbooks
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col -m-4 md:-m-8" data-protected style={{ height: "calc(100vh - 56px)" }}>
      <div
        id="screenshot-guard"
        style={{
          display: "none",
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "black",
          color: "white",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.5rem",
          fontWeight: "bold",
        }}
      >
        Content protected — screenshots are not allowed.
      </div>
      <style>{`
        [data-protected] canvas,
        [data-protected] .pdf-content-area {
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
          pointer-events: auto;
        }
        @media print {
          [data-protected] {
            display: none !important;
          }
          body::after {
            content: "Printing is not allowed for textbook content.";
            display: block;
            text-align: center;
            padding: 2rem;
            font-size: 1.5rem;
          }
        }
      `}</style>
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b bg-background flex-wrap z-10">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/textbooks")} data-testid="button-back-textbooks">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-sm font-semibold leading-tight" data-testid="text-textbook-title">{textbook.title}</h1>
            <p className="text-xs text-muted-foreground">Grade {textbook.grade}</p>
          </div>
        </div>

        {/* Page nav */}
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} data-testid="button-prev-page">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={1}
              max={totalPages}
              value={currentPage}
              onChange={e => {
                const v = parseInt(e.target.value);
                if (!isNaN(v)) goToPage(v);
              }}
              className="w-14 h-8 text-center text-sm"
              data-testid="input-page-number"
            />
            <span className="text-sm text-muted-foreground">/ {totalPages || "..."}</span>
          </div>
          <Button size="icon" variant="ghost" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} data-testid="button-next-page">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Zoom & actions */}
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} data-testid="button-zoom-out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
          <Button size="icon" variant="ghost" onClick={() => setZoom(z => Math.min(3, z + 0.25))} data-testid="button-zoom-in">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAskHelp(true)}
            data-testid="button-ask-for-help"
          >
            <HelpCircle className="h-4 w-4 mr-1" />
            Ask for Help
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleFullscreen} data-testid="button-fullscreen">
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Annotation toolbar */}
      <div className="flex items-center gap-1 px-3 py-1 border-b bg-muted/30 flex-wrap">
        {tools.map(({ tool, icon: Icon, label }) => (
          <Button
            key={tool}
            size="icon"
            variant={activeTool === tool ? "default" : "ghost"}
            onClick={() => setActiveTool(tool)}
            title={label}
            data-testid={`button-tool-${tool}`}
          >
            <Icon className="h-4 w-4" />
          </Button>
        ))}
        <div className="w-px h-6 bg-border mx-1" />
        {ANNOT_COLORS.map(color => (
          <button
            key={color}
            className={cn(
              "w-6 h-6 rounded-full border-2 flex-shrink-0",
              activeColor === color ? "border-foreground scale-110" : "border-transparent"
            )}
            style={{ backgroundColor: color }}
            onClick={() => setActiveColor(color)}
            data-testid={`button-color-${color.replace("#", "")}`}
          />
        ))}
        <div className="w-px h-6 bg-border mx-1" />
        <label className="text-xs text-muted-foreground mr-1">Size</label>
        <input
          type="range"
          min={1}
          max={12}
          value={strokeWidth}
          onChange={e => setStrokeWidth(parseInt(e.target.value))}
          className="w-20 accent-primary"
          data-testid="input-stroke-width"
        />
        <div className="w-px h-6 bg-border mx-1" />
        <Button size="icon" variant="ghost" onClick={handleUndo} disabled={undoStack.length === 0} title="Undo" data-testid="button-undo">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={handleRedo} disabled={redoStack.length === 0} title="Redo" data-testid="button-redo">
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>

      {sharedByUserId && sharedStrokesMap.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/30 border-b text-sm text-blue-700 dark:text-blue-300" data-testid="banner-shared-annotations">
          <Pencil className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Viewing shared annotations from the sender</span>
        </div>
      )}

      {/* PDF + annotation canvas area */}
      <div className="flex-1 min-h-0 overflow-auto bg-muted/50" ref={containerRef}>
        <div className="flex justify-center py-4">
          <div className="relative shadow-lg" style={{ width: pageSize.width || "100%", maxWidth: "100%" }}>
            {pdfLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            )}
            <canvas
              ref={pdfCanvasRef}
              className="block"
              style={{ width: "100%", height: "auto" }}
              data-testid="canvas-pdf"
            />
            <canvas
              ref={annotCanvasRef}
              className={cn(
                "absolute top-0 left-0 block",
                activeTool !== "select" ? "cursor-crosshair" : "cursor-default",
                activeTool === "select" ? "pointer-events-none" : ""
              )}
              style={{ width: "100%", height: "100%" }}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
              data-testid="canvas-annotations"
            />
          </div>
        </div>
      </div>

      {/* Ask for Help overlay */}
      {showAskHelp && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="dialog-ask-help">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Ask for Help</h2>
              <Button size="icon" variant="ghost" onClick={() => { setShowAskHelp(false); setVoiceBlob(null); voiceBlobRef.current = null; voiceDataRef.current = null; }} data-testid="button-close-ask-help">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <p className="text-sm text-muted-foreground mb-2">
              Your current page view and annotations will be captured and sent.
            </p>
            <div className="text-xs text-muted-foreground mb-3 p-2 bg-muted rounded-md">
              {textbook.title} &middot; Grade {textbook.grade} &middot; Page {currentPage}
            </div>

            {/* Snapshot preview */}
            <div className="mb-3 border rounded-md overflow-hidden max-h-48">
              <canvas
                ref={el => {
                  if (el && pdfCanvasRef.current) {
                    el.width = 300;
                    const aspect = pdfCanvasRef.current.height / pdfCanvasRef.current.width;
                    el.height = 300 * aspect;
                    const ctx = el.getContext("2d")!;
                    ctx.drawImage(pdfCanvasRef.current, 0, 0, el.width, el.height);
                    if (annotCanvasRef.current) {
                      ctx.drawImage(annotCanvasRef.current, 0, 0, el.width, el.height);
                    }
                  }
                }}
                className="w-full"
                data-testid="canvas-help-preview"
              />
            </div>

            <Textarea
              placeholder="Describe what you need help with..."
              value={helpMessage}
              onChange={e => setHelpMessage(e.target.value)}
              className="mb-3"
              rows={3}
              data-testid="input-help-message"
            />

            {/* Voice note */}
            <div className="mb-3">
              {showVoiceRecorder ? (
                <VoiceRecorder
                  autoAttach
                  onSend={async (blob) => {
                    console.log("[AskHelp] onSend received blob:", blob.size, "type:", blob.type);
                    setVoiceBlob(blob);
                    voiceBlobRef.current = blob;
                    try {
                      const buf = await blob.arrayBuffer();
                      voiceDataRef.current = { buffer: buf, type: blob.type || "audio/webm" };
                      console.log("[AskHelp] Voice data buffered:", buf.byteLength, "bytes");
                    } catch (e) {
                      console.error("[AskHelp] Failed to buffer voice data:", e);
                    }
                    setShowVoiceRecorder(false);
                  }}
                  onCancel={() => setShowVoiceRecorder(false)}
                />
              ) : voiceBlob ? (
                <div className="flex items-center gap-2 p-2 bg-muted rounded-md" data-testid="voice-attached-preview">
                  <Mic className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="text-sm text-muted-foreground flex-1">Voice note attached</span>
                  <Button size="icon" variant="ghost" onClick={() => { setVoiceBlob(null); voiceBlobRef.current = null; voiceDataRef.current = null; }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setShowVoiceRecorder(true)} data-testid="button-attach-voice">
                  <Mic className="h-4 w-4 mr-1" />
                  Attach Voice Note
                </Button>
              )}
            </div>

            <Input
              placeholder="Search for a tutor or learner..."
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              className="mb-2"
              data-testid="input-help-user-search"
            />

            <div className="max-h-48 overflow-y-auto space-y-1">
              {searchResults.map(u => (
                <button
                  key={u.id}
                  className="w-full flex items-center gap-3 p-2 rounded-md hover-elevate text-left"
                  onClick={() => handleAskForHelp(u)}
                  disabled={isSendingHelp}
                  data-testid={`button-ask-help-user-${u.id}`}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={u.avatar || undefined} />
                    <AvatarFallback className="text-xs">
                      {(u.name || u.username || "?").substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name || u.username}</p>
                    <p className="text-xs text-muted-foreground capitalize">{u.role}</p>
                  </div>
                  {isSendingHelp ? (
                    <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                  ) : (
                    <Send className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              ))}
              {userSearch.length >= 1 && searchResults.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">No users found</p>
              )}
              {userSearch.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">
                  Search for a tutor or learner to send your help request
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
