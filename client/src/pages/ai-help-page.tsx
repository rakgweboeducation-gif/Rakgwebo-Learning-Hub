import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ImagePlus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { apiUrl } from "@/lib/api-config";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function preprocessLatex(text: string): string {
  let result = text;

  result = result.replace(
    /\\\[([\s\S]*?)\\\]/g,
    (_m, inner) => `\n$$${inner.trim()}$$\n`,
  );
  result = result.replace(
    /\\\(([\s\S]*?)\\\)/g,
    (_m, inner) => `$${inner.trim()}$`,
  );

  return result;
}

export default function AIHelpPage() {
  const [question, setQuestion] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [followUp, setFollowUp] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  const { mutate, isPending, error } = useMutation({
    mutationFn: async ({
      question,
      image,
      history,
    }: {
      question: string;
      image?: File;
      history?: ChatMessage[];
    }) => {
      if (image) {
        const formData = new FormData();
        formData.append("question", question);
        formData.append("image", image);

        if (history) {
          formData.append("history", JSON.stringify(history));
        }

        const res = await fetch(apiUrl("/api/ai/quick-question"), {
          method: "POST",
          credentials: "include",
          body: formData,
        });

        if (!res.ok) throw new Error("Failed to get response");
        return res.json();
      } else {
        const res = await fetch(apiUrl("/api/ai/quick-question"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, history }),
        });

        if (!res.ok) throw new Error("Failed to get response");
        return res.json();
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() && !imageFile) return;

    const userMsg = question || "Solve this from the image";

    mutate(
      { question: userMsg, image: imageFile || undefined },
      {
        onSuccess: (data) => {
          setConversation([
            { role: "user", content: userMsg },
            { role: "assistant", content: data.answer },
          ]);
          setQuestion("");
          setImageFile(null);
        },
      },
    );
  };

  const handleFollowUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUp.trim()) return;

    const userMsg = followUp;
    const updated = [...conversation, { role: "user", content: userMsg }];
    setConversation(updated);
    setFollowUp("");

    mutate(
      { question: userMsg, history: updated },
      {
        onSuccess: (data) => {
          setConversation((prev) => [
            ...prev,
            { role: "assistant", content: data.answer },
          ]);
        },
      },
    );
  };

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <h1 className="text-3xl font-bold text-center">Homework Help</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Textarea
          placeholder="Ask your question..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />

        <div className="flex justify-between">
          <Button type="button" onClick={() => fileInputRef.current?.click()}>
            <ImagePlus className="mr-2" /> Upload
          </Button>

          <Button type="submit" disabled={isPending}>
            {isPending ? "Solving..." : "Submit"}
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          hidden
          onChange={(e) => setImageFile(e.target.files?.[0] || null)}
        />
      </form>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {conversation.map((msg, i) => (
          <Card key={i}>
            <CardContent>
              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {preprocessLatex(msg.content)}
              </ReactMarkdown>
            </CardContent>
          </Card>
        ))}
      </div>

      <div ref={bottomRef} />

      <form onSubmit={handleFollowUp} className="flex gap-2">
        <Input
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
          placeholder="Ask follow-up..."
        />
        <Button type="submit">Send</Button>
      </form>
    </div>
  );
}
