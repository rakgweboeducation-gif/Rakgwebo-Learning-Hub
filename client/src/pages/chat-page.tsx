import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "../lib/queryClient";
import { useAuth } from "../hooks/use-auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { ScrollArea } from "../components/ui/scroll-area";
import { Badge } from "../components/ui/badge";
import {
  MessageSquare, Send, Search, Plus, ArrowLeft,
  Pencil, X, Paperclip, PenLine, Smile, Mic, FileText
} from "lucide-react";
import { cn } from "../lib/utils";
import { Whiteboard } from "../components/whiteboard";
import { EmojiPicker } from "../components/emoji-picker";
import { VoiceRecorder } from "../components/voice-recorder";
import { playNotificationSound } from "../lib/notification-sound";
import { showNotification, updateAppBadge } from "../lib/push-notifications";
import type { User, ChatMessage } from "@shared/schema";
import { apiUrl } from "../lib/api-config";
import { TappableAvatar } from "../components/profile-viewer";

type ChatSessionWithMeta = {
  id: number;
  name: string | null;
  type: string | null;
  createdAt: string | null;
  whiteboardData: any;
  participants: User[];
  lastMessage?: ChatMessage;
};

function getInitials(user: Pick<User, "username" | "name">) {
  return (user.name || user.username || "?").substring(0, 2).toUpperCase();
}

function getOtherParticipant(session: ChatSessionWithMeta, currentUserId: number) {
  return session.participants.find(p => p.id !== currentUserId) || session.participants[0];
}

function formatTime(dateStr: string | null | Date) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diff < 604800000) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function MessageContent({ content, isMine }: { content: string; isMine: boolean }) {
  const deepLinkMatch = content.match(/🔗\s*(\/textbooks\/\d+\?page=\d+(?:&sharedBy=\d+)?)/);
  if (deepLinkMatch) {
    const link = deepLinkMatch[1];
    const parts = content.split(deepLinkMatch[0]);
    return (
      <div className="text-sm break-words">
        {parts[0] && <p className="whitespace-pre-wrap">{parts[0].trim()}</p>}
        <a
          href={link}
          className={cn(
            "inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md mt-1 underline",
            isMine ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary"
          )}
          data-testid="link-textbook-deeplink"
        >
          Open in Textbook
        </a>
        {parts[1] && <p className="whitespace-pre-wrap mt-1">{parts[1].trim()}</p>}
      </div>
    );
  }
  return <p className="text-sm break-words whitespace-pre-wrap">{content}</p>;
}

export default function ChatPage() {
  const { user } = useAuth();
  const initialSessionId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("session")
    : null;
  const [activeSessionId, setActiveSessionId] = useState<number | null>(
    initialSessionId ? parseInt(initialSessionId) : null
  );
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [showMobileMessages, setShowMobileMessages] = useState(!!initialSessionId);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [conversationFilter, setConversationFilter] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{
    url: string;
    name: string;
    type: string;
    previewUrl?: string;
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const whiteboardCanvasRef = useRef<HTMLCanvasElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<number>(0);
  const prevMessageCountRef = useRef<number>(0);
  const hasInteractedRef = useRef(false);

  useEffect(() => {
    const handler = () => { hasInteractedRef.current = true; };
    window.addEventListener("click", handler, { once: true });
    window.addEventListener("keydown", handler, { once: true });
    return () => {
      window.removeEventListener("click", handler);
      window.removeEventListener("keydown", handler);
    };
  }, []);

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<ChatSessionWithMeta[]>({
    queryKey: ["/api/chat/sessions"],
    refetchInterval: 3000,
  });

  const { data: unreadCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/chat/unread"],
    refetchInterval: 3000,
  });

  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat/sessions", activeSessionId, "messages"],
    enabled: !!activeSessionId,
    refetchInterval: 2000,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/chat/sessions/${activeSessionId}/messages`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
  });

  const { data: searchResults = [] } = useQuery<Partial<User>[]>({
    queryKey: ["/api/chat/users/search", searchQuery],
    enabled: searchQuery.length >= 1 && showNewChat,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/chat/users/search?q=${encodeURIComponent(searchQuery)}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to search users");
      return res.json();
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, type, mediaUrl }: { content?: string; type?: string; mediaUrl?: string }) => {
      const res = await apiRequest("POST", `/api/chat/sessions/${activeSessionId}/messages`, {
        content, type: type || "text", mediaUrl,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions", activeSessionId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });
    },
  });

  const startChatMutation = useMutation({
    mutationFn: async ({ targetUserId, initialMessage }: { targetUserId: number; initialMessage?: string }) => {
      const res = await apiRequest("POST", "/api/chat/sessions", { targetUserId, initialMessage });
      return res.json();
    },
    onSuccess: (data: ChatSessionWithMeta) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });
      setActiveSessionId(data.id);
      setShowNewChat(false);
      setSearchQuery("");
      setShowMobileMessages(true);
    },
  });

  useEffect(() => {
    if (messages.length > 0) {
      const lastId = messages[messages.length - 1].id;
      if (lastId !== lastMessageIdRef.current) {
        const isNewIncoming = lastMessageIdRef.current > 0 &&
          messages[messages.length - 1].senderId !== user?.id;
        lastMessageIdRef.current = lastId;
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

        if (isNewIncoming && hasInteractedRef.current) {
          playNotificationSound();
          const lastMsg = messages[messages.length - 1];
          if (document.hidden) {
            showNotification("New Message", {
              body: lastMsg.content || "You have a new message",
              tag: `chat-msg-${activeSessionId}`,
              data: { url: "/chat" },
            });
          }
        }

        if (activeSessionId) {
          apiRequest("POST", `/api/chat/sessions/${activeSessionId}/read`, { lastMessageId: lastId })
            .then(() => queryClient.invalidateQueries({ queryKey: ["/api/chat/unread"] }))
            .catch(() => {});
        }
      }
    }
  }, [messages, activeSessionId, user?.id]);

  useEffect(() => {
    const totalUnread = Object.values(unreadCounts).reduce((sum: number, c) => sum + (c as number), 0);
    if (totalUnread > prevMessageCountRef.current && prevMessageCountRef.current > 0 && hasInteractedRef.current) {
      if (!activeSessionId) {
        playNotificationSound();
      }
    }
    prevMessageCountRef.current = totalUnread;
  }, [unreadCounts, activeSessionId]);

  const handleSend = useCallback(() => {
    if (!activeSessionId) return;
    const hasText = messageInput.trim().length > 0;
    const hasAttachment = !!pendingAttachment;
    if (!hasText && !hasAttachment) return;

    if (hasAttachment) {
      const caption = hasText ? messageInput.trim() : pendingAttachment!.name;
      sendMessageMutation.mutate({
        content: caption,
        type: pendingAttachment!.type,
        mediaUrl: pendingAttachment!.url,
      });
      if (pendingAttachment!.previewUrl) URL.revokeObjectURL(pendingAttachment!.previewUrl);
      setPendingAttachment(null);
    } else {
      sendMessageMutation.mutate({ content: messageInput.trim() });
    }
    setMessageInput("");
    setShowEmojiPicker(false);
  }, [messageInput, activeSessionId, sendMessageMutation, pendingAttachment]);

  const markedReadForSessionRef = useRef<number | null>(null);

  const handleSelectSession = (id: number) => {
    setActiveSessionId(id);
    setShowMobileMessages(true);
    lastMessageIdRef.current = 0;
    markedReadForSessionRef.current = null;
  };
  useEffect(() => {
    if (activeSessionId && messages.length > 0) {
      const lastId = messages[messages.length - 1].id;
      if (markedReadForSessionRef.current !== activeSessionId) {
        markedReadForSessionRef.current = activeSessionId;
        apiRequest("POST", `/api/chat/sessions/${activeSessionId}/read`, { lastMessageId: lastId })
          .then(() => queryClient.invalidateQueries({ queryKey: ["/api/chat/unread"] }))
          .catch(() => {});
      }
    }
  }, [activeSessionId, messages]);

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const otherUser = activeSession && user ? getOtherParticipant(activeSession, user.id) : null;

  const handleSendWhiteboardSnapshot = async (dataUrl: string) => {
    if (!activeSessionId) return;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const formData = new FormData();
      formData.append("file", blob, `whiteboard-${Date.now()}.png`);
      const res = await fetch(apiUrl("/api/chat/upload"), { method: "POST", body: formData, credentials: "include" });
      const { url } = await res.json();
      sendMessageMutation.mutate({ content: "Whiteboard explanation", type: "whiteboard", mediaUrl: url });
    } catch (err) {
      console.error("Failed to send whiteboard:", err);
    }
  };

  const handleSendRecording = async (videoBlob: Blob) => {
    if (!activeSessionId) return;
    try {
      const formData = new FormData();
      formData.append("file", videoBlob, `recording-${Date.now()}.webm`);
      const res = await fetch(apiUrl("/api/chat/upload"), { method: "POST", body: formData, credentials: "include" });
      const { url } = await res.json();
      sendMessageMutation.mutate({ content: "Whiteboard recording", type: "video", mediaUrl: url });
    } catch (err) {
      console.error("Failed to send recording:", err);
    }
  };

  const handleSendVoiceNote = async (blob: Blob) => {
    if (!activeSessionId) return;
    try {
      const formData = new FormData();
      formData.append("file", blob, `voice-${Date.now()}.webm`);
      const res = await fetch(apiUrl("/api/chat/upload"), { method: "POST", body: formData, credentials: "include" });
      const { url } = await res.json();
      sendMessageMutation.mutate({ content: "Voice note", type: "audio", mediaUrl: url });
      setShowVoiceRecorder(false);
    } catch (err) {
      console.error("Voice upload failed:", err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeSessionId) return;
    e.target.value = "";
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(apiUrl("/api/chat/upload"), { method: "POST", body: formData, credentials: "include" });
      const { url } = await res.json();
      let type = "file";
      let previewUrl: string | undefined;
      if (file.type.startsWith("image/")) {
        type = "image";
        previewUrl = URL.createObjectURL(file);
      } else if (file.type.startsWith("video/")) {
        type = "video";
      } else if (file.type.startsWith("audio/")) {
        type = "audio";
      } else if (file.type === "application/pdf") {
        type = "file";
      }
      setPendingAttachment({ url, name: file.name, type, previewUrl });
    } catch (err) {
      console.error("Upload failed:", err);
    }
    setIsUploading(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-chat-title">Chat & Whiteboard</h1>
        <p className="text-muted-foreground mt-1">Message learners and tutors, share visual explanations.</p>
      </div>

      <Card className="flex overflow-hidden" style={{ height: "calc(100vh - 14rem)" }}>
        {/* Sidebar */}
        <div className={cn(
          "w-full md:w-80 md:min-w-[320px] border-r flex flex-col",
          showMobileMessages ? "hidden md:flex" : "flex"
        )}>
          <div className="p-3 border-b flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                className="pl-9"
                value={conversationFilter}
                onChange={e => setConversationFilter(e.target.value)}
                data-testid="input-chat-search"
              />
            </div>
            <Button size="icon" variant="ghost" onClick={() => { setShowNewChat(true); setSearchQuery(""); }} data-testid="button-new-chat">
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {showNewChat && (
            <div className="p-3 border-b bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold flex-1">New Chat</h3>
                <Button size="icon" variant="ghost" onClick={() => setShowNewChat(false)} data-testid="button-close-new-chat">
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <Input
                placeholder="Search for a user..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                data-testid="input-user-search"
                autoFocus
              />
              {searchResults.length > 0 && (
                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                  {searchResults.map(u => (
                    <button
                      key={u.id}
                      className="w-full flex items-center gap-3 p-2 rounded-md hover-elevate text-left"
                      onClick={() => startChatMutation.mutate({ targetUserId: u.id! })}
                      data-testid={`button-start-chat-${u.id}`}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={u.avatar || undefined} />
                        <AvatarFallback className="text-xs">{getInitials(u as User)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{u.name || u.username}</p>
                        <p className="text-xs text-muted-foreground capitalize">{u.role}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {searchQuery.length >= 1 && searchResults.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2 text-center">No users found</p>
              )}
            </div>
          )}

          <ScrollArea className="flex-1">
            {sessionsLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>
            ) : sessions.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No conversations yet</p>
                <p className="text-xs mt-1">Start a new chat to get going</p>
              </div>
            ) : (
              sessions
              .filter(session => {
                if (!conversationFilter.trim()) return true;
                const other = user ? getOtherParticipant(session, user.id) : null;
                const filterLower = conversationFilter.toLowerCase();
                return (other?.name?.toLowerCase().includes(filterLower) ||
                  other?.username?.toLowerCase().includes(filterLower) ||
                  session.lastMessage?.content?.toLowerCase().includes(filterLower));
              })
              .map(session => {
                const other = user ? getOtherParticipant(session, user.id) : null;
                const isActive = session.id === activeSessionId;
                const unread = (unreadCounts as Record<string, number>)[String(session.id)] || 0;
                return (
                  <button
                    key={session.id}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 text-left transition-colors border-b",
                      isActive ? "bg-primary/10" : "hover-elevate"
                    )}
                    onClick={() => handleSelectSession(session.id)}
                    data-testid={`button-session-${session.id}`}
                  >
                    <div className="relative flex-shrink-0">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={other?.avatar || undefined} />
                        <AvatarFallback>{other ? getInitials(other) : "?"}</AvatarFallback>
                      </Avatar>
                      <TappableAvatar
                        src={other?.avatar}
                        fallback={other ? getInitials(other) : "?"}
                        className="h-10 w-10"
                        name={other?.name || other?.username}
                        data-testid={`avatar-chat-${session.id}`}
                      />
                      {unread > 0 && (
                        <span
                          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1"
                          data-testid={`badge-unread-${session.id}`}
                        >
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className={cn("text-sm truncate", unread > 0 ? "font-bold" : "font-medium")}>{other?.name || other?.username || "Chat"}</p>
                        {session.lastMessage && (
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {formatTime(session.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      {session.lastMessage && (
                        <p className={cn("text-xs truncate mt-0.5", unread > 0 ? "text-foreground font-semibold" : "text-muted-foreground")}>
                          {session.lastMessage.type === "image" ? "Sent an image" :
                           session.lastMessage.type === "video" ? "Sent a recording" :
                           session.lastMessage.type === "audio" ? "Sent a voice note" :
                           session.lastMessage.type === "whiteboard" ? "Shared whiteboard" :
                           session.lastMessage.type === "file" ? "Sent a file" :
                           session.lastMessage.content || "..."}
                        </p>
                      )}
                      {other?.role && (
                        <Badge variant="secondary" className="text-[10px] mt-1">{other.role}</Badge>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </ScrollArea>
        </div>

        {/* Message Area */}
        <div className={cn(
          "flex-1 flex flex-col min-w-0 relative",
          !showMobileMessages ? "hidden md:flex" : "flex"
        )}>
          {activeSession && otherUser ? (
            <>
              {/* Header */}
              <div className="p-3 border-b flex items-center gap-3">
                <Button
                  size="icon"
                  variant="ghost"
                  className="md:hidden"
                  onClick={() => setShowMobileMessages(false)}
                  data-testid="button-back-to-conversations"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <Avatar className="h-9 w-9">
                  <AvatarImage src={otherUser.avatar || undefined} />
                  <AvatarFallback>{getInitials(otherUser)}</AvatarFallback>
                </Avatar>
                <TappableAvatar
                  src={otherUser.avatar}
                  fallback={getInitials(otherUser)}
                  className="h-9 w-9"
                  name={otherUser.name || otherUser.username}
                  data-testid="avatar-chat-partner"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" data-testid="text-chat-partner">{otherUser.name || otherUser.username}</p>
                  <p className="text-xs text-muted-foreground capitalize">{otherUser.role} {otherUser.grade ? `\u00b7 Grade ${otherUser.grade}` : ""}</p>
                </div>
                <Button
                  size="icon"
                  variant={showWhiteboard ? "default" : "ghost"}
                  onClick={() => setShowWhiteboard(prev => !prev)}
                  title={showWhiteboard ? "Hide whiteboard" : "Open whiteboard"}
                  data-testid="button-toggle-whiteboard"
                >
                  <PenLine className="w-4 h-4" />
                </Button>
              </div>

              {/* Whiteboard Panel */}
              {showWhiteboard && (
                <div className="border-b" style={{ height: "60%", minHeight: "400px" }}>
                  <Whiteboard
                    sessionId={activeSessionId!}
                    onSendSnapshot={handleSendWhiteboardSnapshot}
                    onSendRecording={handleSendRecording}
                    canvasRef={whiteboardCanvasRef}
                  />
                </div>
              )}

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3">
                  {messages.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
                      <p className="text-sm">No messages yet. Say hello!</p>
                    </div>
                  )}
                  {messages.map(msg => {
                    const isMine = msg.senderId === user?.id;
                    return (
                      <div key={msg.id} className={cn("flex", isMine ? "justify-end" : "justify-start")} data-testid={`message-${msg.id}`}>
                        <div className={cn(
                          "max-w-[75%] rounded-lg px-3 py-2",
                          isMine ? "bg-primary text-primary-foreground" : "bg-muted"
                        )}>
                          {msg.type === "image" && msg.mediaUrl && (
                            <img src={msg.mediaUrl} alt={msg.content || "Image"} className="rounded-md max-w-full max-h-60 mb-1" data-testid={`image-message-${msg.id}`} />
                          )}
                          {msg.type === "video" && msg.mediaUrl && (
                            <video src={msg.mediaUrl} controls className="rounded-md max-w-full max-h-60 mb-1" data-testid={`video-message-${msg.id}`} />
                          )}
                          {msg.type === "audio" && msg.mediaUrl && (
                            <audio src={msg.mediaUrl} controls className="max-w-full mb-1" data-testid={`audio-message-${msg.id}`} />
                          )}
                          {msg.type === "whiteboard" && msg.mediaUrl && (
                            <img src={msg.mediaUrl} alt="Whiteboard" className="rounded-md max-w-full max-h-60 mb-1 bg-white" data-testid={`whiteboard-message-${msg.id}`} />
                          )}
                          {msg.type === "file" && msg.mediaUrl && (
                            <div data-testid={`file-message-${msg.id}`}>
                              <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 rounded-md bg-background/20">
                                <FileText className="w-5 h-5 flex-shrink-0" />
                                <span className="text-sm underline truncate">{msg.mediaUrl.split("/").pop() || "Download file"}</span>
                              </a>
                              {msg.content && (
                                <p className="text-sm break-words mt-1">{msg.content}</p>
                              )}
                            </div>
                          )}
                          {msg.mediaUrl && msg.type !== "file" && msg.type !== "audio" && msg.content && msg.content !== "Voice note" && msg.content !== "Whiteboard explanation" && msg.content !== "Whiteboard recording" && (
                            <MessageContent content={msg.content} isMine={isMine} />
                          )}
                          {!msg.mediaUrl && msg.content && <MessageContent content={msg.content} isMine={isMine} />}
                          <p className={cn("text-[10px] mt-1", isMine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                            {formatTime(msg.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Emoji picker */}
              {showEmojiPicker && (
                <div className="absolute bottom-16 left-4 z-50">
                  <EmojiPicker onSelect={(emoji) => {
                    setMessageInput(prev => prev + emoji);
                    setShowEmojiPicker(false);
                  }} />
                </div>
              )}

              {/* Compose */}
              <div className="border-t">
                {/* Attachment preview */}
                {pendingAttachment && (
                  <div className="px-3 pt-2 pb-1" data-testid="attachment-preview">
                    <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                      {pendingAttachment.type === "image" && pendingAttachment.previewUrl ? (
                        <img src={pendingAttachment.previewUrl} alt={pendingAttachment.name} className="w-16 h-16 object-cover rounded-md" data-testid="attachment-preview-image" />
                      ) : (
                        <div className="w-12 h-12 bg-background rounded-md flex items-center justify-center">
                          <FileText className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{pendingAttachment.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{pendingAttachment.type}</p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (pendingAttachment.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl);
                          setPendingAttachment(null);
                        }}
                        data-testid="button-remove-attachment"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Uploading indicator */}
                {isUploading && (
                  <div className="px-3 pt-2 pb-1">
                    <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                      <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
                      <span className="text-sm text-muted-foreground">Uploading file...</span>
                    </div>
                  </div>
                )}

                {/* Voice recorder */}
                {showVoiceRecorder ? (
                  <div className="p-3">
                    <VoiceRecorder
                      onSend={handleSendVoiceNote}
                      onCancel={() => setShowVoiceRecorder(false)}
                    />
                  </div>
                ) : (
                  <div className="p-3 flex items-end gap-1">
                    <input
                      type="file"
                      id="chat-file-input"
                      className="hidden"
                      accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
                      onChange={handleFileUpload}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => document.getElementById("chat-file-input")?.click()}
                      title="Attach file"
                      disabled={isUploading}
                      data-testid="button-attach-file"
                    >
                      <Paperclip className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setShowEmojiPicker(prev => !prev)}
                      title="Emoji"
                      data-testid="button-emoji"
                    >
                      <Smile className="w-4 h-4" />
                    </Button>
                    <Input
                      placeholder={pendingAttachment ? "Add a caption..." : "Type a message..."}
                      value={messageInput}
                      onChange={e => setMessageInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) handleSend();
                      }}
                      onFocus={() => setShowEmojiPicker(false)}
                      className="flex-1"
                      data-testid="input-chat-message"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setShowVoiceRecorder(true)}
                      title="Voice note"
                      data-testid="button-voice-note"
                    >
                      <Mic className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      onClick={handleSend}
                      disabled={(!messageInput.trim() && !pendingAttachment) || sendMessageMutation.isPending}
                      data-testid="button-send-message"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
              <MessageSquare className="w-16 h-16 mb-4 opacity-10" />
              <p className="text-lg font-medium">Select a conversation</p>
              <p className="text-sm mt-1 text-center">Choose an existing chat or start a new one to begin messaging.</p>
              <Button variant="outline" className="mt-4" onClick={() => { setShowNewChat(true); setShowMobileMessages(false); }} data-testid="button-start-new-chat">
                <Plus className="w-4 h-4 mr-2" />
                New Chat
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
