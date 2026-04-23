import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { BrainCircuit, Send, Sparkles, AlertCircle, ImagePlus, X, MessageSquarePlus, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { MathGraph, parseGraphBlock } from "@/components/math-graph";
import { apiUrl } from "@/lib/api-config";

function preprocessLatex(text: string): string {
  let result = text;

  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner) => `\n$$${inner.trim()}$$\n`);
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner) => `$${inner.trim()}$`);

  const keepEnvs = ["cases", "pmatrix", "bmatrix", "vmatrix", "array"];
  const envRe = /\\begin\{(align\*?|aligned|equation\*?|gather\*?|multline\*?|cases|pmatrix|bmatrix|vmatrix|array)\}([\s\S]*?)\\end\{\1\}/g;
  result = result.replace(envRe, (_m, env, inner) => {
    const alreadyWrapped = _m.length > 0 && result.indexOf(_m) > 0 &&
      (result[result.indexOf(_m) - 1] === '$' || result[result.indexOf(_m) - 2] === '$');
    if (alreadyWrapped) return _m;
    if (keepEnvs.includes(env)) {
      return `\n$$\\begin{${env}}${inner}\\end{${env}}$$\n`;
    }
    const lines = inner.trim().split(/\\\\\s*/).filter((l: string) => l.trim());
    if (lines.length <= 1) {
      return `\n$$${inner.trim()}$$\n`;
    }
    return "\n" + lines.map((l: string) => {
      let cleaned = l.trim();
      cleaned = cleaned.replace(/^&\s*/, "").replace(/\s*&\s*/g, " ");
      return `$$${cleaned}$$`;
    }).join("\n") + "\n";
  });

  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (match, inner) => {
    if (/\\\\/.test(inner) && !/\\begin/.test(inner)) {
      const lines = inner.trim().split(/\\\\\s*/).filter((l: string) => l.trim());
      if (lines.length > 1) {
        return "\n" + lines.map((l: string) => {
          let cleaned = l.trim();
          cleaned = cleaned.replace(/^&\s*/, "").replace(/\s*&\s*/g, " ");
          return `$$${cleaned}$$`;
        }).join("\n") + "\n";
      }
    }
    return match;
  });

  result = result.replace(/\$\$\s*\$\$/g, "");

  result = result.replace(/([^\n])\$\$/g, "$1\n$$");
  result = result.replace(/\$\$([^\n$])/g, "$$\n$1");

  return result;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function AIHelpPage() {
  const [question, setQuestion] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [followUp, setFollowUp] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (conversation.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversation]);

  const { mutate, isPending, error } = useMutation({
    mutationFn: async ({ question, image, history }: { question: string; image?: File; history?: ChatMessage[] }) => {
      if (image) {
        const formData = new FormData();
        formData.append("question", question);
        formData.append("image", image);
        if (history && history.length > 0) {
          formData.append("history", JSON.stringify(history));
        }
        const res = await fetch(apiUrl("/api/ai/quick-question"), {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: "Failed to get response" }));
          throw new Error(err.message || "Failed to get response");
        }
        return res.json();
      } else {
        const res = await fetch(apiUrl("/api/ai/quick-question"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, history }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: "Failed to get response" }));
          throw new Error(err.message || "Failed to get response");
        }
        return res.json();
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() && !imageFile) return;

    const userMsg = question || "Please solve this problem from the image.";

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
          setImagePreview(null);
        },
      }
    );
  };

  const handleFollowUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUp.trim() || isPending) return;

    const userMsg = followUp.trim();
    const updatedHistory = [...conversation, { role: "user" as const, content: userMsg }];

    setConversation(updatedHistory);
    setFollowUp("");

    mutate(
      { question: userMsg, history: updatedHistory },
      {
        onSuccess: (data) => {
          setConversation(prev => [
            ...prev,
            { role: "assistant", content: data.answer },
          ]);
        },
      }
    );
  };

  const handleNewQuestion = () => {
    setConversation([]);
    setQuestion("");
    setFollowUp("");
    setImageFile(null);
    setImagePreview(null);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const hasConversation = conversation.length > 0;

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-8 px-4">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center p-3 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl shadow-lg shadow-blue-500/20 mb-4">
          <BrainCircuit className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400" data-testid="text-page-title">
          Homework Help
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          Stuck on a problem? Type your question or upload a photo of your homework for a step-by-step explanation.
        </p>
      </div>

      {!hasConversation && (
        <Card className="border-0 shadow-2xl bg-white/50 backdrop-blur-sm ring-1 ring-slate-200 dark:bg-slate-900/50 dark:ring-slate-800">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Textarea
                  placeholder={"e.g. Solve for x: 2x² + 5x - 3 = 0\n\nOr upload a photo of your homework below..."}
                  className="min-h-[120px] resize-none text-lg p-4 bg-white dark:bg-slate-950 border-slate-200 focus:ring-2 focus:ring-blue-500/20"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  data-testid="input-question"
                />
              </div>

              {imagePreview && (
                <div className="relative inline-block" data-testid="image-preview">
                  <img src={imagePreview} alt="Uploaded question" className="max-h-48 rounded-lg border shadow-sm" />
                  <button
                    type="button"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                    onClick={removeImage}
                    data-testid="button-remove-image"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageSelect}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-upload-image"
                  >
                    <ImagePlus className="w-4 h-4 mr-2" />
                    Upload Photo
                  </Button>
                  <span className="text-xs text-muted-foreground">Take a pic of your homework</span>
                </div>
                <Button
                  type="submit"
                  size="lg"
                  disabled={isPending || (!question.trim() && !imageFile)}
                  data-testid="button-submit"
                >
                  {isPending ? (
                    <>
                      <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                      Solving...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Get Solution
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {error && !hasConversation && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {isPending && !hasConversation && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/3 rounded-lg" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      )}

      {hasConversation && (
        <div className="space-y-4" data-testid="conversation-container">
          {conversation.map((msg, i) => (
            <div key={i}>
              {msg.role === "user" ? (
                <div className="flex justify-end mb-2">
                  <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-3 max-w-[85%]">
                    <p className="text-sm">{msg.content}</p>
                  </div>
                </div>
              ) : (
                <Card className="overflow-hidden border-slate-200 dark:border-slate-700 shadow-lg mb-2">
                  <div className="bg-slate-50 dark:bg-slate-900 border-b p-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-500" />
                    <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">AI Tutor</span>
                  </div>
                  <CardContent className="p-5 prose prose-slate dark:prose-invert max-w-none prose-pre:bg-slate-100 dark:prose-pre:bg-slate-800 prose-code:text-purple-600 dark:prose-code:text-purple-400">
                    <ReactMarkdown
                      remarkPlugins={[remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        code({ className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || "");
                          if (match && match[1] === "graph") {
                            const graphProps = parseGraphBlock(String(children).replace(/\n$/, ""));
                            if (graphProps) {
                              return <MathGraph {...graphProps} />;
                            }
                          }
                          return <code className={className} {...props}>{children}</code>;
                        },
                        pre({ children }) {
                          return <>{children}</>;
                        },
                      }}
                    >
                      {preprocessLatex(msg.content)}
                    </ReactMarkdown>
                  </CardContent>
                </Card>
              )}
            </div>
          ))}

          {isPending && (
            <Card className="overflow-hidden border-slate-200 shadow-lg">
              <div className="bg-slate-50 dark:bg-slate-900 border-b p-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-500 animate-spin" />
                <span className="font-semibold text-sm">Thinking...</span>
              </div>
              <CardContent className="p-5 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
              </CardContent>
            </Card>
          )}

          <Card className="border-0 shadow-lg ring-1 ring-slate-200 dark:ring-slate-700" data-testid="followup-card">
            <CardContent className="p-4">
              <form onSubmit={handleFollowUp} className="flex gap-2">
                <Input
                  placeholder="Ask a follow-up... e.g. 'Show me another example' or 'Explain step 3 more'"
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                  disabled={isPending}
                  className="flex-1"
                  data-testid="input-followup"
                />
                <Button
                  type="submit"
                  disabled={isPending || !followUp.trim()}
                  data-testid="button-followup-submit"
                >
                  {isPending ? (
                    <Sparkles className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </form>
              <div className="flex flex-wrap gap-2 mt-3">
                {["Show me another example", "Explain it simpler", "What if the numbers change?", "Show the graph"].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="text-xs px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    onClick={() => setFollowUp(suggestion)}
                    disabled={isPending}
                    data-testid={`button-suggestion-${suggestion.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <MessageSquarePlus className="w-3 h-3 inline mr-1" />
                    {suggestion}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={handleNewQuestion}
              data-testid="button-new-question"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Ask a New Question
            </Button>
          </div>

          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
