import { useState, useEffect } from "react";
import {
  useATPTopics,
  useATPSubjects,
  useGenerateQuiz,
  useSubmitQuiz,
} from "../hooks/use-modules";
import { useAuth } from "../hooks/use-auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { ScrollArea } from "../components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { useToast } from "../hooks/use-toast";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type { QuizSession } from "@shared/schema";
import { apiUrl } from "../lib/api-config";

interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export default function ATPPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const defaultGrade = user?.grade || 10;
  const [selectedGrade, setSelectedGrade] = useState<number>(defaultGrade);
  const [selectedSubject, setSelectedSubject] = useState<string>("Mathematics");
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);

  const { data: subjects } = useATPSubjects(selectedGrade);
  const { data: topics, isLoading: topicsLoading } = useATPTopics(
    selectedGrade,
    selectedSubject,
  );

  const [quizSession, setQuizSession] = useState<QuizSession | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<(number | null)[]>([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const generateQuiz = useGenerateQuiz();
  const submitQuiz = useSubmitQuiz();

  const selectedTopic = topics?.find((t) => t.id === selectedTopicId);

  useEffect(() => {
    if (subjects?.length) {
      setSelectedSubject(
        subjects.includes("Mathematics") ? "Mathematics" : subjects[0],
      );
    }
  }, [subjects]);

  const resetQuiz = () => {
    setQuizSession(null);
    setSelectedAnswers([]);
    setQuizSubmitted(false);
  };

  const handleGenerateQuiz = () => {
    if (!selectedTopicId) return;

    resetQuiz();

    generateQuiz.mutate(
      { topicId: selectedTopicId },
      {
        onSuccess: (data) => {
          setQuizSession(data);
          const questions = data.questions as QuizQuestion[];
          setSelectedAnswers(new Array(questions.length).fill(null));
        },
      },
    );
  };

  const handleSubmitQuiz = () => {
    if (!quizSession) return;

    const answers = selectedAnswers.map((a) => a ?? -1);

    submitQuiz.mutate(
      { quizId: quizSession.id, answers },
      {
        onSuccess: (data) => {
          setQuizSession(data);
          setQuizSubmitted(true);
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to submit quiz.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleShareQuiz = async () => {
    if (!quizSession?.shareToken) return;

    try {
      const res = await fetch(apiUrl("/api/share-config"));
      const config = res.ok ? await res.json() : {};

      const baseUrl = config.customDomain
        ? `https://${config.customDomain}`
        : window.location.origin;

      const url = `${baseUrl}/quiz/${quizSession.shareToken}`;

      await navigator.clipboard.writeText(url);

      toast({
        title: "Link copied!",
        description: "Share this link with friends.",
      });
    } catch {
      const url = `${window.location.origin}/quiz/${quizSession.shareToken}`;

      await navigator.clipboard.writeText(url);

      toast({
        title: "Link copied!",
        description: "Share this link with friends.",
      });
    }
  };

  const handleSelectAnswer = (qi: number, oi: number) => {
    if (quizSubmitted) return;

    setSelectedAnswers((prev) => {
      const next = [...prev];
      next[qi] = oi;
      return next;
    });
  };

  const questions = quizSession
    ? (quizSession.questions as QuizQuestion[])
    : [];

  const allAnswered =
    selectedAnswers.length > 0 && selectedAnswers.every((a) => a !== null);

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6">
      <div className="w-80 flex flex-col gap-4">
        <Select
          value={String(selectedGrade)}
          onValueChange={(v) => {
            setSelectedGrade(Number(v));
            setSelectedTopicId(null);
            resetQuiz();
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((g) => (
              <SelectItem key={g} value={String(g)}>
                Grade {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ScrollArea className="flex-1">
          {topicsLoading ? (
            <Loader2 className="animate-spin mx-auto mt-10" />
          ) : (
            topics?.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedTopicId(t.id);
                  resetQuiz();
                }}
                className={cn(
                  "w-full text-left p-2",
                  selectedTopicId === t.id && "bg-primary/10",
                )}
              >
                {t.topic}
              </button>
            ))
          )}
        </ScrollArea>
      </div>

      <div className="flex-1">
        {selectedTopic ? (
          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle>{selectedTopic.topic}</CardTitle>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto">
              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {selectedTopic.content || ""}
              </ReactMarkdown>

              {!quizSession && (
                <Button onClick={handleGenerateQuiz}>Take Quiz</Button>
              )}

              {quizSession && (
                <div className="space-y-4 mt-6">
                  {questions.map((q, qi) => (
                    <div key={qi}>
                      <p>{q.question}</p>

                      {q.options.map((opt, oi) => (
                        <button
                          key={oi}
                          onClick={() => handleSelectAnswer(qi, oi)}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  ))}

                  {!quizSubmitted && (
                    <Button onClick={handleSubmitQuiz} disabled={!allAnswered}>
                      Submit
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="flex items-center justify-center h-full">
            Select a topic
          </div>
        )}
      </div>
    </div>
  );
}
