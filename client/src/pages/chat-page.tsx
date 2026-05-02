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
X, Paperclip, PenLine, Smile, Mic, FileText
} from "lucide-react";
import { cn } from "../lib/utils";
import { Whiteboard } from "../components/whiteboard";
import { EmojiPicker } from "../components/emoji-picker";
import { VoiceRecorder } from "../components/voice-recorder";
import type { User, ChatMessage } from "@shared/schema";
import { apiUrl } from "../lib/api-config";

export default function ChatPage() {
const { user } = useAuth();
const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
const [messageInput, setMessageInput] = useState("");
const messagesEndRef = useRef<HTMLDivElement>(null);

// ✅ FIXED (no duplicate res)
const { data: messages = [] } = useQuery<ChatMessage[]>({
queryKey: ["/api/chat/messages", activeSessionId],
enabled: !!activeSessionId,
queryFn: async () => {
const res = await fetch(apiUrl(`/api/chat/sessions/${activeSessionId}/messages`), {
credentials: "include",
});
if (!res.ok) throw new Error("Failed to fetch messages");
return res.json();
},
});

const sendMessageMutation = useMutation({
mutationFn: async (content: string) => {
const res = await apiRequest(
"POST",
`/api/chat/sessions/${activeSessionId}/messages`,
{ content }
);
return res.json();
},
onSuccess: () => {
queryClient.invalidateQueries({
queryKey: ["/api/chat/messages", activeSessionId],
});
},
});

const handleSend = () => {
if (!messageInput.trim() || !activeSessionId) return;
sendMessageMutation.mutate(messageInput.trim());
setMessageInput("");
};

useEffect(() => {
messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
}, [messages]);

return ( <div className="p-4"> <Card className="h-[80vh] flex flex-col"> <div className="p-3 border-b font-bold">
Chat </div>

```
    <ScrollArea className="flex-1 p-3">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={cn(
            "mb-2",
            msg.senderId === user?.id ? "text-right" : "text-left"
          )}
        >
          <div className="inline-block bg-muted px-3 py-2 rounded">
            {msg.content}
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </ScrollArea>

    <div className="p-3 border-t flex gap-2">
      <Input
        value={messageInput}
        onChange={(e) => setMessageInput(e.target.value)}
        placeholder="Type a message..."
      />
      <Button onClick={handleSend}>
        <Send className="w-4 h-4" />
      </Button>
    </div>
  </Card>
</div>
```

);
}
