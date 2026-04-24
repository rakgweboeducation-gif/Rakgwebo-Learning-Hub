import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "../components/ui/button";
import { Slider } from "../components/ui/slider";
import {
  Pencil, Eraser, Trash2, Undo2, Redo2, Download, Share2,
  Circle, Square, Minus, Type, Video, StopCircle, ImagePlus,
  MousePointer2, FileText, Move, Play, X, Send, ArrowLeft
} from "lucide-react";
import { cn } from "../lib/utils";
import { Badge } from "../components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "../components/ui/dialog";
import { ScrollArea } from "../components/ui/scroll-area";
import { Checkbox } from "../components/ui/checkbox";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type Tool = "pen" | "eraser" | "line" | "rectangle" | "circle" | "text" | "select";

type StrokePoint = {
  x: number;
  y: number;
  pressure: number;
  timestamp: number;
};

type DrawAction = {
  type: Tool | "image" | "document";
  color: string;
  lineWidth: number;
  points?: StrokePoint[];
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  text?: string;
  imageData?: string;
  imageWidth?: number;
  imageHeight?: number;
  docName?: string;
};

const COLORS = [
  "#000000", "#ffffff", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280",
];

const HANDLE_SIZE = 16;

function getStrokeWidth(baseWidth: number, pressure: number, speed: number): number {
  const pressureFactor = 0.4 + pressure * 0.6;
  const speedFactor = Math.max(0.3, 1 - Math.min(speed / 2000, 0.7));
  return baseWidth * pressureFactor * speedFactor;
}

function drawSmoothStroke(ctx: CanvasRenderingContext2D, points: StrokePoint[], baseWidth: number, color: string, isEraser: boolean) {
  if (points.length === 0) return;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = isEraser ? "#ffffff" : color;

  if (points.length === 1) {
    const w = getStrokeWidth(baseWidth, points[0].pressure, 0);
    ctx.fillStyle = isEraser ? "#ffffff" : color;
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, w / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  let avgPressure = 0;
  let avgSpeed = 0;
  for (let i = 0; i < points.length; i++) {
    avgPressure += points[i].pressure;
    if (i > 0) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      const dt = Math.max(points[i].timestamp - points[i - 1].timestamp, 1);
      avgSpeed += Math.sqrt(dx * dx + dy * dy) / dt * 1000;
    }
  }
  avgPressure /= points.length;
  avgSpeed /= Math.max(points.length - 1, 1);

  const w = getStrokeWidth(baseWidth, avgPressure, avgSpeed);
  ctx.lineWidth = isEraser ? w * 3 : w;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
  } else {
    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i].x + points[i + 1].x) / 2;
      const midY = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  ctx.stroke();
}

function getActionBounds(action: DrawAction): { x: number; y: number; w: number; h: number } | null {
  if ((action.type === "image" || action.type === "document") && action.startX !== undefined && action.startY !== undefined) {
    return {
      x: action.startX,
      y: action.startY,
      w: action.imageWidth || 200,
      h: action.imageHeight || 200,
    };
  }
  return null;
}

type HandleType = "nw" | "ne" | "sw" | "se" | "body";

function hitTestAction(action: DrawAction, px: number, py: number, handleSize: number): HandleType | null {
  const bounds = getActionBounds(action);
  if (!bounds) return null;
  const { x, y, w, h } = bounds;
  const hs = handleSize;

  if (px >= x - hs && px <= x + hs && py >= y - hs && py <= y + hs) return "nw";
  if (px >= x + w - hs && px <= x + w + hs && py >= y - hs && py <= y + hs) return "ne";
  if (px >= x - hs && px <= x + hs && py >= y + h - hs && py <= y + h + hs) return "sw";
  if (px >= x + w - hs && px <= x + w + hs && py >= y + h - hs && py <= y + h + hs) return "se";

  if (px >= x && px <= x + w && py >= y && py <= y + h) return "body";
  return null;
}

function drawSelectionHandles(ctx: CanvasRenderingContext2D, action: DrawAction, hs: number) {
  const bounds = getActionBounds(action);
  if (!bounds) return;
  const { x, y, w, h } = bounds;

  ctx.save();
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 6]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  const corners = [
    [x, y], [x + w, y],
    [x, y + h], [x + w, y + h],
  ];
  for (const [cx, cy] of corners) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - hs / 2, cy - hs / 2, hs, hs);
  }
  ctx.restore();
}

interface WhiteboardProps {
  sessionId: number;
  onSendSnapshot?: (dataUrl: string) => void;
  onSendRecording?: (videoBlob: Blob) => void;
  canvasRef?: React.MutableRefObject<HTMLCanvasElement | null>;
}

export function Whiteboard({ sessionId, onSendSnapshot, onSendRecording, canvasRef: externalCanvasRef }: WhiteboardProps) {
  const internalCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = externalCanvasRef || internalCanvasRef;
  const containerRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#000000");
  const [lineWidth, setLineWidth] = useState(3);
  const isDrawingRef = useRef(false);
  const [actions, setActions] = useState<DrawAction[]>([]);
  const [redoStack, setRedoStack] = useState<DrawAction[]>([]);
  const currentActionRef = useRef<DrawAction | null>(null);
  const [, forceRender] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ width: 1280, height: 720 });
  const [displaySize, setDisplaySize] = useState({ width: 800, height: 450 });
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const animFrameRef = useRef<number>(0);
  const needsRedrawRef = useRef(false);
  const actionsRef = useRef<DrawAction[]>([]);
  actionsRef.current = actions;
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedIndexRef = useRef<number | null>(null);
  selectedIndexRef.current = selectedIndex;
  const dragStateRef = useRef<{
    handle: HandleType;
    startPx: number;
    startPy: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const [showPdfPicker, setShowPdfPicker] = useState(false);
  const [pdfPages, setPdfPages] = useState<{ pageNum: number; dataUrl: string; selected: boolean }[]>([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const dpr = Math.max(window.devicePixelRatio || 1, 2);
        const dw = Math.floor(rect.width);
        const dh = Math.floor(rect.height);
        setDisplaySize({ width: dw, height: dh });
        setCanvasSize({
          width: Math.max(1280, dw * dpr),
          height: Math.max(720, dh * dpr),
        });
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: false });
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const allActions = currentActionRef.current
      ? [...actionsRef.current, currentActionRef.current]
      : actionsRef.current;

    for (let i = 0; i < allActions.length; i++) {
      const action = allActions[i];
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if ((action.type === "pen" || action.type === "eraser") && action.points && action.points.length > 0) {
        drawSmoothStroke(ctx, action.points, action.lineWidth, action.color, action.type === "eraser");
      } else if (action.type === "line" && action.startX !== undefined) {
        ctx.strokeStyle = action.color;
        ctx.lineWidth = action.lineWidth;
        ctx.beginPath();
        ctx.moveTo(action.startX, action.startY!);
        ctx.lineTo(action.endX || action.startX, action.endY || action.startY!);
        ctx.stroke();
      } else if (action.type === "rectangle" && action.startX !== undefined) {
        ctx.strokeStyle = action.color;
        ctx.lineWidth = action.lineWidth;
        const w = (action.endX || action.startX) - action.startX;
        const h = (action.endY || action.startY!) - action.startY!;
        ctx.strokeRect(action.startX, action.startY!, w, h);
      } else if (action.type === "circle" && action.startX !== undefined) {
        ctx.strokeStyle = action.color;
        ctx.lineWidth = action.lineWidth;
        const dx = (action.endX || action.startX) - action.startX;
        const dy = (action.endY || action.startY!) - action.startY!;
        const radius = Math.sqrt(dx * dx + dy * dy);
        ctx.beginPath();
        ctx.arc(action.startX, action.startY!, radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (action.type === "image" && action.imageData && action.startX !== undefined) {
        const cached = imageCacheRef.current.get(action.imageData);
        if (cached && cached.complete) {
          const w = action.imageWidth || cached.naturalWidth;
          const h = action.imageHeight || cached.naturalHeight;
          ctx.drawImage(cached, action.startX, action.startY!, w, h);
        } else if (!cached) {
          const img = new Image();
          img.onload = () => {
            imageCacheRef.current.set(action.imageData!, img);
            needsRedrawRef.current = true;
          };
          img.src = action.imageData;
          imageCacheRef.current.set(action.imageData, img);
        }
      } else if (action.type === "document" && action.startX !== undefined) {
        const w = action.imageWidth || 200;
        const h = action.imageHeight || 240;
        ctx.fillStyle = "#f1f5f9";
        ctx.fillRect(action.startX, action.startY!, w, h);
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 2;
        ctx.strokeRect(action.startX, action.startY!, w, h);

        const iconSize = 48;
        const iconX = action.startX + w / 2 - iconSize / 2;
        const iconY = action.startY! + h / 2 - iconSize;
        ctx.fillStyle = "#3b82f6";
        ctx.fillRect(iconX, iconY, iconSize, iconSize * 1.3);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 20px sans-serif";
        ctx.textAlign = "center";
        const ext = (action.docName || "").split('.').pop()?.toUpperCase() || "DOC";
        ctx.fillText(ext, iconX + iconSize / 2, iconY + iconSize * 0.75);

        ctx.fillStyle = "#334155";
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        const name = action.docName || "Document";
        const maxTextW = w - 20;
        let displayName = name;
        if (ctx.measureText(name).width > maxTextW) {
          displayName = name.substring(0, 20) + "...";
        }
        ctx.fillText(displayName, action.startX + w / 2, action.startY! + h - 20);
        ctx.textAlign = "start";
      } else if (action.type === "text" && action.text && action.startX !== undefined) {
        ctx.fillStyle = action.color;
        ctx.font = `${action.lineWidth * 6}px sans-serif`;
        ctx.fillText(action.text, action.startX, action.startY!);
      }

      if (selectedIndex === i && (action.type === "image" || action.type === "document")) {
        drawSelectionHandles(ctx, action, HANDLE_SIZE);
      }
    }
  }, [canvasRef, selectedIndex]);

  useEffect(() => {
    const loop = () => {
      if (needsRedrawRef.current) {
        needsRedrawRef.current = false;
        renderCanvas();
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [renderCanvas]);

  useEffect(() => {
    needsRedrawRef.current = true;
  }, [actions, selectedIndex]);

  const getCanvasPoint = useCallback((e: PointerEvent): StrokePoint => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, pressure: 0.5, timestamp: Date.now() };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const pressure = e.pressure > 0 ? e.pressure : 0.5;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      pressure,
      timestamp: Date.now(),
    };
  }, [canvasRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const toolRef = { current: tool };
    const colorRef = { current: color };
    const lineWidthRef = { current: lineWidth };

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);

      if (toolRef.current === "select") {
        const pt = getCanvasPoint(e);
        const allActions = actionsRef.current;
        for (let i = allActions.length - 1; i >= 0; i--) {
          const action = allActions[i];
          if (action.type === "image" || action.type === "document") {
            const handle = hitTestAction(action, pt.x, pt.y, HANDLE_SIZE);
            if (handle) {
              setSelectedIndex(i);
              const bounds = getActionBounds(action)!;
              dragStateRef.current = {
                handle,
                startPx: pt.x,
                startPy: pt.y,
                origX: bounds.x,
                origY: bounds.y,
                origW: bounds.w,
                origH: bounds.h,
              };
              isDrawingRef.current = true;
              needsRedrawRef.current = true;
              return;
            }
          }
        }
        setSelectedIndex(null);
        needsRedrawRef.current = true;
        return;
      }

      if (toolRef.current === "text") {
        const pt = getCanvasPoint(e);
        const text = prompt("Enter text:");
        if (text) {
          const action: DrawAction = { type: "text", color: colorRef.current, lineWidth: lineWidthRef.current, text, startX: pt.x, startY: pt.y };
          setActions(prev => [...prev, action]);
          setRedoStack([]);
        }
        return;
      }

      const pt = getCanvasPoint(e);
      isDrawingRef.current = true;

      if (toolRef.current === "pen" || toolRef.current === "eraser") {
        currentActionRef.current = { type: toolRef.current, color: colorRef.current, lineWidth: lineWidthRef.current, points: [pt] };
      } else {
        currentActionRef.current = { type: toolRef.current, color: colorRef.current, lineWidth: lineWidthRef.current, startX: pt.x, startY: pt.y, endX: pt.x, endY: pt.y };
      }
      needsRedrawRef.current = true;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();

      if (toolRef.current === "select" && dragStateRef.current) {
        const pt = getCanvasPoint(e);
        const ds = dragStateRef.current;
        const dx = pt.x - ds.startPx;
        const dy = pt.y - ds.startPy;
        const targetIdx = selectedIndexRef.current;

        setActions(prev => {
          if (targetIdx === null || targetIdx < 0 || targetIdx >= prev.length) return prev;
          const next = [...prev];
          const action = { ...next[targetIdx] };

          if (ds.handle === "body") {
            action.startX = ds.origX + dx;
            action.startY = ds.origY + dy;
          } else {
            let newX = ds.origX, newY = ds.origY, newW = ds.origW, newH = ds.origH;
            if (ds.handle === "se") {
              newW = Math.max(60, ds.origW + dx);
              newH = Math.max(60, ds.origH + dy);
            } else if (ds.handle === "sw") {
              newW = Math.max(60, ds.origW - dx);
              newH = Math.max(60, ds.origH + dy);
              newX = ds.origX + ds.origW - newW;
            } else if (ds.handle === "ne") {
              newW = Math.max(60, ds.origW + dx);
              newH = Math.max(60, ds.origH - dy);
              newY = ds.origY + ds.origH - newH;
            } else if (ds.handle === "nw") {
              newW = Math.max(60, ds.origW - dx);
              newH = Math.max(60, ds.origH - dy);
              newX = ds.origX + ds.origW - newW;
              newY = ds.origY + ds.origH - newH;
            }
            action.startX = newX;
            action.startY = newY;
            action.imageWidth = Math.floor(newW);
            action.imageHeight = Math.floor(newH);
          }
          next[targetIdx] = action;
          return next;
        });
        needsRedrawRef.current = true;
        return;
      }

      if (!currentActionRef.current) return;

      const events = (e as any).getCoalescedEvents?.() || [e];

      for (const evt of events) {
        const pt = getCanvasPoint(evt);
        const ca = currentActionRef.current;

        if (ca.type === "pen" || ca.type === "eraser") {
          ca.points = [...(ca.points || []), pt];
        } else {
          ca.endX = pt.x;
          ca.endY = pt.y;
        }
      }
      needsRedrawRef.current = true;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;

      if (toolRef.current === "select") {
        dragStateRef.current = null;
        return;
      }

      if (!currentActionRef.current) return;
      const finished = { ...currentActionRef.current };
      if (finished.points) finished.points = [...finished.points];
      currentActionRef.current = null;
      setActions(prev => [...prev, finished]);
      setRedoStack([]);
      needsRedrawRef.current = true;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);
    };
  }, [canvasRef, getCanvasPoint, tool, color, lineWidth]);

  const undo = () => {
    if (actions.length === 0) return;
    const last = actions[actions.length - 1];
    setActions(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, last]);
    setSelectedIndex(null);
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const last = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setActions(prev => [...prev, last]);
  };

  const clearCanvas = () => {
    setActions([]);
    setRedoStack([]);
    setSelectedIndex(null);
  };

  const addImageToCanvas = (dataUrl: string, fileName?: string) => {
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const maxW = canvas.width * 0.6;
      const maxH = canvas.height * 0.6;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > maxW) { h = h * (maxW / w); w = maxW; }
      if (h > maxH) { w = w * (maxH / h); h = maxH; }
      const x = (canvas.width - w) / 2;
      const y = (canvas.height - h) / 2;
      imageCacheRef.current.set(dataUrl, img);
      const action: DrawAction = {
        type: "image",
        color: "",
        lineWidth: 0,
        imageData: dataUrl,
        startX: x,
        startY: y,
        imageWidth: Math.floor(w),
        imageHeight: Math.floor(h),
      };
      setActions(prev => [...prev, action]);
      setRedoStack([]);
      needsRedrawRef.current = true;
    };
    img.src = dataUrl;
  };

  const addDocumentToCanvas = (fileName: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = 200;
    const h = 240;
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;
    const action: DrawAction = {
      type: "document",
      color: "",
      lineWidth: 0,
      startX: x,
      startY: y,
      imageWidth: w,
      imageHeight: h,
      docName: fileName,
    };
    setActions(prev => [...prev, action]);
    setRedoStack([]);
    needsRedrawRef.current = true;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        addImageToCanvas(dataUrl);
      };
      reader.readAsDataURL(file);
    } else if (file.type === "application/pdf") {
      await loadPdfPages(file);
    } else {
      addDocumentToCanvas(file.name);
    }
  };

  const loadPdfPages = async (file: File) => {
    setPdfLoading(true);
    setShowPdfPicker(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
      const pdf = await loadingTask.promise;
      const pages: { pageNum: number; dataUrl: string; selected: boolean }[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const offCanvas = document.createElement("canvas");
        offCanvas.width = viewport.width;
        offCanvas.height = viewport.height;
        const offCtx = offCanvas.getContext("2d")!;
        await page.render({ canvasContext: offCtx, viewport, canvas: offCanvas } as any).promise;
        pages.push({ pageNum: i, dataUrl: offCanvas.toDataURL("image/png", 0.95), selected: false });
      }

      setPdfPages(pages);
    } catch (err) {
      console.error("PDF load failed:", err);
      addDocumentToCanvas(file.name);
      setShowPdfPicker(false);
    }
    setPdfLoading(false);
  };

  const handlePdfPageToggle = (pageNum: number) => {
    setPdfPages(prev => prev.map(p => p.pageNum === pageNum ? { ...p, selected: !p.selected } : p));
  };

  const handlePdfInsert = () => {
    const selected = pdfPages.filter(p => p.selected);
    if (selected.length === 0) {
      setShowPdfPicker(false);
      setPdfPages([]);
      return;
    }
    for (const page of selected) {
      addImageToCanvas(page.dataUrl);
    }
    setShowPdfPicker(false);
    setPdfPages([]);
    setTool("select");
  };

  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingLoopRef = useRef<{ active: boolean }>({ active: false });

  const startRecording = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const srcW = canvas.width;
      const srcH = canvas.height;
      const aspect = srcW / srcH;
      let recW: number, recH: number;
      if (aspect >= 16 / 9) {
        recW = 1920;
        recH = Math.round(1920 / aspect);
      } else {
        recH = 1080;
        recW = Math.round(1080 * aspect);
      }
      recW = recW % 2 === 0 ? recW : recW + 1;
      recH = recH % 2 === 0 ? recH : recH + 1;

      const recordCanvas = document.createElement("canvas");
      recordCanvas.width = recW;
      recordCanvas.height = recH;
      const recordCtx = recordCanvas.getContext("2d")!;

      recordingLoopRef.current = { active: true };
      const loopRef = recordingLoopRef.current;
      const drawLoop = () => {
        if (!loopRef.active) return;
        recordCtx.fillStyle = "#ffffff";
        recordCtx.fillRect(0, 0, recW, recH);
        recordCtx.drawImage(canvas, 0, 0, recW, recH);
        requestAnimationFrame(drawLoop);
      };

      const canvasStream = recordCanvas.captureStream(30);
      let combinedStream = canvasStream;

      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const tracks = [...canvasStream.getTracks(), ...audioStream.getTracks()];
        combinedStream = new MediaStream(tracks);
      } catch {
      }

      recordingStreamRef.current = combinedStream;

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 5000000,
      });
      recordingChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        loopRef.active = false;
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl(url);
        setIsRecording(false);
        setRecordingTime(0);
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        combinedStream.getTracks().forEach(t => t.stop());
        recordingStreamRef.current = null;
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      drawLoop();

      const hardTimeout = setTimeout(() => {
        stopRecording();
      }, 300000);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 299) {
            clearTimeout(hardTimeout);
            stopRecording();
            return 300;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error("Recording failed:", err);
    }
  };

  const stopRecording = () => {
    recordingLoopRef.current.active = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  };

  const handleSendRecordedVideo = () => {
    if (recordedBlob && onSendRecording) {
      onSendRecording(recordedBlob);
    }
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
  };

  const handleDiscardRecording = () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
  };

  const handleSendSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas || !onSendSnapshot) return;
    setSelectedIndex(null);
    setTimeout(() => {
      needsRedrawRef.current = true;
      requestAnimationFrame(() => {
        const dataUrl = canvas.toDataURL("image/png");
        onSendSnapshot(dataUrl);
      });
    }, 50);
  };

  const downloadCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prevSelected = selectedIndex;
    setSelectedIndex(null);
    setTimeout(() => {
      needsRedrawRef.current = true;
      requestAnimationFrame(() => {
        const link = document.createElement("a");
        link.download = `whiteboard-${Date.now()}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        setSelectedIndex(prevSelected);
      });
    }, 50);
  };

  const drawTools: { id: Tool; icon: typeof Pencil; label: string }[] = [
    { id: "select", icon: MousePointer2, label: "Select / Move" },
    { id: "pen", icon: Pencil, label: "Pen" },
    { id: "eraser", icon: Eraser, label: "Eraser" },
    { id: "line", icon: Minus, label: "Line" },
    { id: "rectangle", icon: Square, label: "Rectangle" },
    { id: "circle", icon: Circle, label: "Circle" },
    { id: "text", icon: Type, label: "Text" },
  ];

  return (
    <div className="flex flex-col h-full bg-background relative" data-testid="whiteboard-container">
      <div className="flex items-center gap-1 p-2 border-b flex-wrap">
        <div className="flex items-center gap-0.5">
          {drawTools.map(t => (
            <Button
              key={t.id}
              size="icon"
              variant={tool === t.id ? "default" : "ghost"}
              onClick={() => {
                setTool(t.id);
                if (t.id !== "select") {
                  setSelectedIndex(null);
                  dragStateRef.current = null;
                }
              }}
              title={t.label}
              data-testid={`button-tool-${t.id}`}
            >
              <t.icon className="w-4 h-4" />
            </Button>
          ))}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => imageInputRef.current?.click()}
            title="Add image or document"
            data-testid="button-tool-image"
          >
            <ImagePlus className="w-4 h-4" />
          </Button>
        </div>

        <div className="w-px h-6 bg-border mx-1" />

        <div className="flex items-center gap-1">
          {COLORS.map(c => (
            <button
              key={c}
              className={cn(
                "w-6 h-6 rounded-full border-2 transition-transform",
                color === c ? "border-primary scale-110" : "border-transparent"
              )}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
              data-testid={`button-color-${c.replace("#", "")}`}
            />
          ))}
        </div>

        <div className="w-px h-6 bg-border mx-1" />

        <div className="flex items-center gap-2 min-w-[100px]">
          <span className="text-xs text-muted-foreground">Size</span>
          <Slider
            value={[lineWidth]}
            onValueChange={([v]) => setLineWidth(v)}
            min={1}
            max={20}
            step={1}
            className="w-20"
            data-testid="slider-brush-size"
          />
        </div>

        <div className="w-px h-6 bg-border mx-1" />

        <div className="flex items-center gap-0.5">
          <Button size="icon" variant="ghost" onClick={undo} disabled={actions.length === 0} title="Undo" data-testid="button-undo">
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={redo} disabled={redoStack.length === 0} title="Redo" data-testid="button-redo">
            <Redo2 className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={clearCanvas} title="Clear" data-testid="button-clear-whiteboard">
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={downloadCanvas} title="Download" data-testid="button-download-whiteboard">
            <Download className="w-4 h-4" />
          </Button>
          {onSendSnapshot && (
            <Button size="icon" variant="ghost" onClick={handleSendSnapshot} title="Send to chat" data-testid="button-send-whiteboard">
              <Share2 className="w-4 h-4" />
            </Button>
          )}
          {onSendRecording && (
            isRecording ? (
              <Button size="icon" variant="destructive" onClick={stopRecording} title="Stop recording" data-testid="button-stop-recording">
                <StopCircle className="w-4 h-4" />
              </Button>
            ) : (
              <Button size="icon" variant="ghost" onClick={startRecording} title="Record explanation (5 min max)" data-testid="button-start-recording">
                <Video className="w-4 h-4" />
              </Button>
            )
          )}
          {isRecording && (
            <Badge variant="destructive" className="animate-pulse">
              REC {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, "0")} / 5:00
            </Badge>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className={cn(
          "flex-1 min-h-0 overflow-hidden bg-white dark:bg-white",
          tool === "select" ? "cursor-default" : "cursor-crosshair"
        )}
      >
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="touch-none"
          style={{ width: displaySize.width, height: displaySize.height, touchAction: "none" }}
          data-testid="canvas-whiteboard"
        />
      </div>

      {recordedUrl && (
        <div className="absolute inset-0 z-50 bg-background/95 flex flex-col items-center justify-center p-6" data-testid="recording-review">
          <h3 className="text-lg font-semibold mb-4">Review Your Recording</h3>
          <video
            src={recordedUrl}
            controls
            className="max-w-full max-h-[60%] rounded-lg border shadow-lg"
            data-testid="recording-preview-video"
          />
          <div className="flex items-center gap-3 mt-6">
            <Button
              variant="outline"
              onClick={handleDiscardRecording}
              data-testid="button-discard-recording"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Discard
            </Button>
            <Button
              onClick={handleSendRecordedVideo}
              data-testid="button-send-recording"
            >
              <Send className="w-4 h-4 mr-2" />
              Send to Chat
            </Button>
          </div>
        </div>
      )}

      <Dialog open={showPdfPicker} onOpenChange={(open) => { if (!open) { setShowPdfPicker(false); setPdfPages([]); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Select PDF Pages</DialogTitle>
          </DialogHeader>
          {pdfLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
              <span className="ml-3 text-muted-foreground">Loading PDF pages...</span>
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <div className="grid grid-cols-3 gap-3 p-2">
                {pdfPages.map(page => (
                  <button
                    key={page.pageNum}
                    className={cn(
                      "relative border-2 rounded-md overflow-hidden hover-elevate",
                      page.selected ? "border-primary" : "border-border"
                    )}
                    onClick={() => handlePdfPageToggle(page.pageNum)}
                    data-testid={`pdf-page-${page.pageNum}`}
                  >
                    <img src={page.dataUrl} alt={`Page ${page.pageNum}`} className="w-full" />
                    <div className="absolute top-1 left-1 flex items-center gap-1">
                      <Checkbox checked={page.selected} className="bg-background" />
                      <span className="text-xs bg-background/80 px-1 rounded">Page {page.pageNum}</span>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setPdfPages(prev => prev.map(p => ({ ...p, selected: true })))}
              data-testid="button-select-all-pages"
            >
              Select All
            </Button>
            <Button
              onClick={handlePdfInsert}
              disabled={pdfPages.filter(p => p.selected).length === 0}
              data-testid="button-insert-pages"
            >
              Insert {pdfPages.filter(p => p.selected).length} Page{pdfPages.filter(p => p.selected).length !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
