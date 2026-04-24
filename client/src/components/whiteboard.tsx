import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "../components/ui/button";
import { Slider } from "../components/ui/slider";
import {
  Pencil,
  Eraser,
  Trash2,
  Undo2,
  Redo2,
  Download,
  Share2,
  Circle,
  Square,
  Minus,
  Type,
  Video,
  StopCircle,
  ImagePlus,
  MousePointer2,
  FileText,
  Move,
  Play,
  X,
  Send,
  ArrowLeft,
} from "lucide-react";
import { cn } from "../lib/utils"; // ✅ FIXED HERE
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import { ScrollArea } from "../components/ui/scroll-area";
import { Checkbox } from "../components/ui/checkbox";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

// ---------------- TYPES ----------------

type Tool =
  | "pen"
  | "eraser"
  | "line"
  | "rectangle"
  | "circle"
  | "text"
  | "select";

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

// ---------------- CONSTANTS ----------------

const COLORS = [
  "#000000",
  "#ffffff",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#6b7280",
];

const HANDLE_SIZE = 16;

// ---------------- HELPERS ----------------

function getStrokeWidth(
  baseWidth: number,
  pressure: number,
  speed: number,
): number {
  const pressureFactor = 0.4 + pressure * 0.6;
  const speedFactor = Math.max(0.3, 1 - Math.min(speed / 2000, 0.7));
  return baseWidth * pressureFactor * speedFactor;
}

function getActionBounds(action: DrawAction) {
  if (
    (action.type === "image" || action.type === "document") &&
    action.startX !== undefined
  ) {
    return {
      x: action.startX,
      y: action.startY!,
      w: action.imageWidth || 200,
      h: action.imageHeight || 200,
    };
  }
  return null;
}

// ---------------- COMPONENT ----------------

interface WhiteboardProps {
  sessionId: number;
  onSendSnapshot?: (dataUrl: string) => void;
  onSendRecording?: (videoBlob: Blob) => void;
  canvasRef?: React.MutableRefObject<HTMLCanvasElement | null>;
}

export function Whiteboard({
  sessionId,
  onSendSnapshot,
  onSendRecording,
  canvasRef: externalCanvasRef,
}: WhiteboardProps) {
  const internalCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = externalCanvasRef || internalCanvasRef;

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#000000");
  const [lineWidth, setLineWidth] = useState(3);

  const [actions, setActions] = useState<DrawAction[]>([]);
  const [redoStack, setRedoStack] = useState<DrawAction[]>([]);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // ---------------- BASIC ACTIONS ----------------

  const undo = () => {
    if (actions.length === 0) return;
    const last = actions[actions.length - 1];
    setActions((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, last]);
    setSelectedIndex(null);
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const last = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setActions((prev) => [...prev, last]);
  };

  const clearCanvas = () => {
    setActions([]);
    setRedoStack([]);
    setSelectedIndex(null);
  };

  // ---------------- UI ----------------

  const drawTools = [
    { id: "select", icon: MousePointer2, label: "Select" },
    { id: "pen", icon: Pencil, label: "Pen" },
    { id: "eraser", icon: Eraser, label: "Eraser" },
    { id: "line", icon: Minus, label: "Line" },
    { id: "rectangle", icon: Square, label: "Rectangle" },
    { id: "circle", icon: Circle, label: "Circle" },
    { id: "text", icon: Type, label: "Text" },
  ] as const;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* TOOLBAR */}
      <div className="flex items-center gap-2 p-2 border-b flex-wrap">
        {drawTools.map((t) => (
          <Button
            key={t.id}
            size="icon"
            variant={tool === t.id ? "default" : "ghost"}
            onClick={() => setTool(t.id)}
          >
            <t.icon className="w-4 h-4" />
          </Button>
        ))}

        <div className="w-px h-6 bg-border mx-2" />

        {COLORS.map((c) => (
          <button
            key={c}
            className={cn(
              "w-6 h-6 rounded-full border-2",
              color === c ? "border-primary scale-110" : "border-transparent",
            )}
            style={{ backgroundColor: c }}
            onClick={() => setColor(c)}
          />
        ))}

        <div className="w-px h-6 bg-border mx-2" />

        <Slider
          value={[lineWidth]}
          onValueChange={([v]) => setLineWidth(v)}
          min={1}
          max={20}
          step={1}
          className="w-24"
        />

        <div className="w-px h-6 bg-border mx-2" />

        <Button size="icon" variant="ghost" onClick={undo}>
          <Undo2 className="w-4 h-4" />
        </Button>

        <Button size="icon" variant="ghost" onClick={redo}>
          <Redo2 className="w-4 h-4" />
        </Button>

        <Button size="icon" variant="ghost" onClick={clearCanvas}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {/* CANVAS */}
      <div className="flex-1 bg-white">
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="w-full h-full"
        />
      </div>
    </div>
  );
}
