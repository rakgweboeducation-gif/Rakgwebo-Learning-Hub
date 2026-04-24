import { useState, useRef, useCallback } from "react";
import { Button } from "../components/ui/button";
import { Mic, StopCircle, Trash2, Send } from "lucide-react";
import { Badge } from "../components/ui/badge";

interface VoiceRecorderProps {
  onSend: (blob: Blob) => void;
  onCancel: () => void;
  autoAttach?: boolean;
}

function getSupportedMimeType(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
    "",
  ];
  for (const t of types) {
    if (!t || MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

export function VoiceRecorder({ onSend, onCancel, autoAttach }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");
  const onSendRef = useRef(onSend);
  const autoAttachRef = useRef(autoAttach);
  const cancelledRef = useRef(false);
  onSendRef.current = onSend;
  autoAttachRef.current = autoAttach;

  const startRecording = useCallback(async () => {
    setError(null);
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType || "audio/webm";

      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, options);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const finalType = mimeTypeRef.current || recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: finalType });
        console.log("[VoiceRecorder] Recording complete:", blob.size, "bytes, type:", finalType, "chunks:", chunksRef.current.length);
        if (blob.size === 0) {
          setError("Recording produced no audio data. Please try again.");
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        if (autoAttachRef.current && !cancelledRef.current) {
          console.log("[VoiceRecorder] Auto-attaching blob:", blob.size, "bytes");
          onSendRef.current(blob);
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.onerror = (e: Event) => {
        console.error("[VoiceRecorder] Recording error:", e);
        setError("Recording failed. Please try again.");
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("[VoiceRecorder] Failed to start recording:", err);
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        setError("Microphone access denied. Please allow microphone access and try again.");
      } else if (err?.name === "NotFoundError") {
        setError("No microphone found. Please connect a microphone and try again.");
      } else {
        setError("Could not start recording: " + (err?.message || "Unknown error"));
      }
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
  }, []);

  const handleDiscard = () => {
    cancelledRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setIsRecording(false);
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    setError(null);
    onCancel();
  };

  const handleSend = () => {
    if (audioBlob && audioBlob.size > 0) {
      console.log("[VoiceRecorder] Sending blob:", audioBlob.size, "bytes, type:", audioBlob.type);
      onSend(audioBlob);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioBlob(null);
      setAudioUrl(null);
      setDuration(0);
    } else {
      console.error("[VoiceRecorder] handleSend called with invalid blob");
      setError("No valid recording to send. Please record again.");
    }
  };

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (error) {
    return (
      <div className="flex items-center gap-2 w-full text-sm text-destructive" data-testid="voice-error">
        <span className="flex-1">{error}</span>
        <Button size="sm" variant="outline" onClick={() => { setError(null); }} data-testid="button-dismiss-voice-error">
          Dismiss
        </Button>
      </div>
    );
  }

  if (audioBlob && audioUrl) {
    return (
      <div className="flex items-center gap-2 w-full" data-testid="voice-preview">
        <audio src={audioUrl} controls className="flex-1 h-8" data-testid="audio-preview" />
        <Button size="icon" variant="ghost" onClick={handleDiscard} data-testid="button-discard-voice">
          <Trash2 className="w-4 h-4" />
        </Button>
        <Button size="icon" onClick={handleSend} data-testid="button-send-voice">
          <Send className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 w-full" data-testid="voice-recorder">
      {isRecording ? (
        <>
          <Badge variant="destructive" className="animate-pulse">
            <Mic className="w-3 h-3 mr-1" />
            {formatDuration(duration)}
          </Badge>
          <div className="flex-1" />
          <Button size="icon" variant="ghost" onClick={handleDiscard} data-testid="button-cancel-recording">
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="destructive" onClick={stopRecording} data-testid="button-stop-voice">
            <StopCircle className="w-4 h-4" />
          </Button>
        </>
      ) : (
        <Button size="icon" variant="ghost" onClick={startRecording} data-testid="button-start-voice">
          <Mic className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
