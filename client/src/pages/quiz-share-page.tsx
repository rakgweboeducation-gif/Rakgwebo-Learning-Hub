import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Loader2, XCircle, Share2, BookOpen } from "lucide-react";
import { cn } from "../lib/utils";
import { useToast } from "../hooks/use-toast";
import { apiUrl } from "../lib/api-config";

interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer?: number;
  explanation?: string;
}

interface SharedQuiz {
  questions: QuizQuestion[];
  answers: number[] | null;
  score: number | null;
  percentage: number | null;
  feedback: string | null;
  shareToken: string;
  isCompleted: boolean;
}

export default function QuizSharePage({ token }: { token: string }) {
  const [quiz, setQuiz] = useState<SharedQuiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<number, number>
  >({});
  const { toast } = useToast();

  // =====================
  // FETCH QUIZ
  // =====================
  useEffect(() => {
    const fetchQuiz = async () => {
      try {
        const res = await fetch(apiUrl(`/api/quiz/share/${token}`), {
          credentials: "include",
        });

        if (!res.ok) throw new Error("Quiz not found");

        const data = await res.json();
        setQuiz(data);
      } catch (err: any) {
        setError(err.message || "Failed to load quiz");
      } finally {
        setLoading(false);
      }
    };

    fetchQuiz();
  }, [token]);

  // =====================
  // SELECT ANSWER
  // =====================
  const handleSelectAnswer = (questionIndex: number, optionIndex: number) => {
    if (quiz?.isCompleted) return;

    setSelectedAnswers((prev) => ({
      ...prev,
      [questionIndex]: optionIndex,
    }));
  };

  // =====================
  // SHARE
  // =====================
  const handleShare = async () => {
    try {
      const res = await fetch(apiUrl("/api/share-config"), {
        credentials: "include",
      });

      let config: any = {};
      if (res.ok) {
        config = await res.json();
      }

      const baseUrl = config?.customDomain
        ? `https://${config.customDomain}`
        : window.location.origin;

      const url = `${baseUrl}/quiz/${token}`;

      await navigator.clipboard.writeText(url);

      toast({
        title: "Link copied!",
        description: "Share this link with anyone to let them try this quiz.",
      });
    } catch {
      await navigator.clipboard.writeText(
        `${window.location.origin}/quiz/${token}`,
      );
    }
  };

  // =====================
  // LOADING
  // =====================
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // =====================
  // ERROR
  // =====================
  if (error || !quiz) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Quiz Not Found</h2>
            <p className="text-muted-foreground">
              This quiz link may have expired or is invalid.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const questions = quiz.questions;
  const isCompleted = quiz.isCompleted;

  // =====================
  // UI
  // =====================
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* HEADER */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl shadow-lg mb-4">
            <BookOpen className="w-8 h-8 text-white" />
          </div>

          <h1 className="text-3xl font-bold tracking-tight">Shared Quiz</h1>

          <p className="text-muted-foreground">
            {isCompleted
              ? "Here are the quiz results"
              : "Try answering these questions!"}
          </p>
        </div>

        {/* QUESTIONS */}
        {questions.map((q, qIdx) => (
          <Card key={qIdx}>
            <CardHeader>
              <CardTitle>
                Q{qIdx + 1}. {q.question}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-2">
              {q.options.map((opt, oIdx) => {
                const isSelected = selectedAnswers[qIdx] === oIdx;

                return (
                  <button
                    key={oIdx}
                    onClick={() => handleSelectAnswer(qIdx, oIdx)}
                    className={cn(
                      "w-full p-3 border rounded text-left",
                      isSelected && "border-primary bg-primary/10",
                    )}
                  >
                    {opt}
                  </button>
                );
              })}
            </CardContent>
          </Card>
        ))}

        {/* SHARE BUTTON */}
        <div className="flex justify-center">
          <Button onClick={handleShare}>
            <Share2 className="h-4 w-4 mr-2" />
            Share Quiz
          </Button>
        </div>
      </div>
    </div>
  );
}
