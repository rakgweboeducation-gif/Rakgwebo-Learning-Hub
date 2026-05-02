import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../hooks/use-auth";
import { useSessionWebSocket } from "../hooks/use-session-ws";
import { useLocation } from "wouter";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { useToast } from "../hooks/use-toast";

import {
  Mic,
  Video,
  PhoneOff,
  Send,
  BookOpen,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import * as pdfjsLib from "pdfjs-dist/build/pdf";
import { apiUrl } from "../lib/api-config";

// ✅ FIX PDF WORKER
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

export default function SessionRoomPage({ sessionId }: { sessionId: string }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const sid = Number(sessionId);

  const { connected, participants, send } = useSessionWebSocket(
    sid,
    user?.id ?? null,
    user?.username ?? null,
  );

  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const tbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tbPdfRef = useRef<any>(null);

  const [tbPage, setTbPage] = useState(1);
  const [tbTotalPages, setTbTotalPages] = useState(0);

  // =========================
  // LOAD PDF
  // =========================
  const loadTextbook = useCallback(
    async (url: string) => {
      try {
        const pdf = await pdfjsLib.getDocument(url).promise;
        tbPdfRef.current = pdf;
        setTbTotalPages(pdf.numPages);
        await renderPage(pdf, 1);
      } catch (err) {
        console.error("PDF LOAD ERROR:", err);
        toast({
          title: "Failed to load PDF",
          description: "Check file URL or internet connection",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  // =========================
  // RENDER PAGE
  // =========================
  const renderPage = async (pdf: any, pageNum: number) => {
    if (!pdf) return;

    const canvas = tbCanvasRef.current;
    if (!canvas) return;

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;
  };

  // =========================
  // NAVIGATION
  // =========================
  const nextPage = () => {
    if (tbPage < tbTotalPages && tbPdfRef.current) {
      const newPage = tbPage + 1;
      setTbPage(newPage);
      renderPage(tbPdfRef.current, newPage);
    }
  };

  const prevPage = () => {
    if (tbPage > 1 && tbPdfRef.current) {
      const newPage = tbPage - 1;
      setTbPage(newPage);
      renderPage(tbPdfRef.current, newPage);
    }
  };

  // =========================
  // CAMERA
  // =========================
  useEffect(() => {
    let stream: MediaStream | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.warn("Camera error:", err);
      }
    })();

    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // =========================
  // CHAT
  // =========================
  const sendMessage = () => {
    if (!chatInput.trim()) return;

    const msg = {
      id: Date.now(),
      content: chatInput,
    };

    setChatMessages((prev) => [...prev, msg]);

    send({
      type: "chat",
      content: chatInput,
    });

    setChatInput("");
  };

  if (!user) return null;

  // =========================
  // UI
  // =========================
  return (
    <div className="flex flex-col h-screen bg-background">
      {/* TOP BAR */}
      <div className="flex justify-between p-2 border-b">
        <Badge>{connected ? "Connected" : "Reconnecting..."}</Badge>

        <Button onClick={() => loadTextbook("/sample.pdf")}>
          <BookOpen className="w-4 h-4 mr-1" />
          Load PDF
        </Button>
      </div>

      {/* MAIN */}
      <div className="flex flex-1 overflow-hidden">
        {/* VIDEO */}
        <div className="w-64 p-2">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            className="w-full h-40 bg-black rounded"
          />
        </div>

        {/* PDF */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <canvas ref={tbCanvasRef} className="shadow-lg" />

          <div className="flex gap-2 mt-2 items-center">
            <Button onClick={prevPage}>
              <ChevronLeft />
            </Button>

            <span>
              {tbPage} / {tbTotalPages || 1}
            </span>

            <Button onClick={nextPage}>
              <ChevronRight />
            </Button>
          </div>
        </div>

        {/* CHAT */}
        <div className="w-80 border-l flex flex-col">
          <div className="flex-1 overflow-auto p-2">
            {chatMessages.map((m) => (
              <div key={m.id} className="text-sm mb-1">
                {m.content}
              </div>
            ))}
          </div>

          <div className="p-2 flex gap-2">
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            />

            <Button onClick={sendMessage}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* CONTROLS */}
      <div className="flex justify-center gap-3 p-3 border-t">
        <Button variant="secondary">
          <Mic />
        </Button>

        <Button variant="outline">
          <Video />
        </Button>

        <Button variant="destructive" onClick={() => navigate("/")}>
          <PhoneOff />
        </Button>
      </div>
    </div>
  );
}
