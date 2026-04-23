import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, Share2, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { apiUrl } from "@/lib/api-config";

interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer?: number;
  explanation?: string;
}

interface SharedQuiz {
  questions: QuizQuestion[];
  answers: any[] | null;
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
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const { toast } = useToast();

  useEffect(() => {
    fetch(`/api/quiz/share/${token}`)
    fetch(apiUrl(`/api/quiz/share/${token}`))
      .then(res => {
        if (!res.ok) throw new Error("Quiz not found");
        return res.json();
      })
      .then(data => { setQuiz(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [token]);

  const handleSelectAnswer = (questionIndex: number, optionIndex: number) => {
    if (quiz?.isCompleted) return;
    setSelectedAnswers(prev => ({ ...prev, [questionIndex]: optionIndex }));
  };

  const handleShare = async () => {
    try {
      const configRes = await fetch(apiUrl("/api/share-config"));
      const config = configRes.ok ? await configRes.json() : {};
      const baseUrl = config.customDomain
        ? `https://${config.customDomain}`
        : window.location.origin;
      const url = `${baseUrl}/quiz/${token}`;
      await navigator.clipboard.writeText(url);
    } catch {
      await navigator.clipboard.writeText(`${window.location.origin}/quiz/${token}`);
    }
    toast({ title: "Link copied!", description: "Share this link with anyone to let them try this quiz." });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Quiz Not Found</h2>
            <p className="text-muted-foreground">This quiz link may have expired or is invalid.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const questions = quiz.questions;
  const isCompleted = quiz.isCompleted;
  const results = isCompleted ? quiz.answers : null;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl shadow-lg mb-4">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-shared-quiz-title">
            Shared Quiz
          </h1>
          <p className="text-muted-foreground">
            {isCompleted ? "Here are the quiz results" : "Try answering these questions! Log in to submit your answers."}
          </p>
        </div>

        {isCompleted && quiz.score !== null && (
          <Card className={cn(
            "border-2",
            quiz.percentage! >= 80 ? "border-green-500 bg-green-50 dark:bg-green-950/20" :
            quiz.percentage! >= 60 ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20" :
            "border-red-500 bg-red-50 dark:bg-red-950/20"
          )}>
            <CardContent className="pt-6 text-center">
              <div className="text-4xl font-bold mb-2" data-testid="text-quiz-score">
                {quiz.score}/{questions.length}
              </div>
              <Badge variant={quiz.percentage! >= 80 ? "default" : quiz.percentage! >= 60 ? "secondary" : "destructive"} className="text-lg px-4 py-1" data-testid="badge-quiz-percentage">
                {quiz.percentage}%
              </Badge>
              {quiz.feedback && (
                <p className="text-sm text-muted-foreground mt-3">{quiz.feedback}</p>
              )}
            </CardContent>
          </Card>
        )}

        {questions.map((q: QuizQuestion, qIdx: number) => {
          const result = results ? (results as any[])[qIdx] : null;
          return (
            <Card key={qIdx} className={cn(
              "transition-all",
              result?.isCorrect === true && "border-green-500",
              result?.isCorrect === false && "border-red-500"
            )} data-testid={`card-question-${qIdx}`}>
              <CardHeader>
                <CardTitle className="text-base">
                  <span className="text-muted-foreground mr-2">Q{qIdx + 1}.</span>
                  <div className="inline [&_p]:m-0 [&_.katex]:text-base"><ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{q.question}</ReactMarkdown></div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {q.options.map((opt: string, oIdx: number) => {
                  const isSelected = !isCompleted && selectedAnswers[qIdx] === oIdx;
                  const isCorrectOption = result && result.correct === oIdx;
                  const isWrongSelected = result && result.selected === oIdx && !result.isCorrect;

                  return (
                    <button
                      key={oIdx}
                      onClick={() => handleSelectAnswer(qIdx, oIdx)}
                      disabled={isCompleted}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3",
                        !isCompleted && isSelected && "border-primary bg-primary/10",
                        !isCompleted && !isSelected && "border-border hover:border-primary/50",
                        isCorrectOption && "border-green-500 bg-green-50 dark:bg-green-950/20",
                        isWrongSelected && "border-red-500 bg-red-50 dark:bg-red-950/20",
                        isCompleted && "cursor-default"
                      )}
                      data-testid={`option-${qIdx}-${oIdx}`}
                    >
                      {isCorrectOption && <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />}
                      {isWrongSelected && <XCircle className="h-5 w-5 text-red-600 shrink-0" />}
                      {!isCorrectOption && !isWrongSelected && (
                        <div className={cn(
                          "h-5 w-5 rounded-full border-2 shrink-0",
                          isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                        )} />
                      )}
                      <div className="text-sm [&_p]:m-0 [&_.katex]:text-sm"><ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={{ p: ({children}) => <span>{children}</span> }}>{opt.replace(/^[A-D][).:‐\-]\s*/i, '')}</ReactMarkdown></div>
                    </button>
                  );
                })}
                {result && q.explanation && (
                  <div className="mt-3 p-3 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground [&_p]:inline [&_p]:m-0 [&_.katex]:text-sm">
                      <span className="font-medium">Explanation: </span>
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{q.explanation || ''}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        <div className="flex justify-center gap-4">
          <Button onClick={handleShare} variant="outline" size="lg" data-testid="button-share-quiz">
            <Share2 className="h-4 w-4 mr-2" />
            Share Quiz
          </Button>
        </div>
      </div>
    </div>
  );
}
