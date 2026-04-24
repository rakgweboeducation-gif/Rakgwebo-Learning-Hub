import { useState, useEffect } from "react";
import { useATPTopics, useATPSubjects, useGenerateQuiz, useSubmitQuiz } from "../hooks/use-modules";
import { useAuth } from "../hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { ChevronRight, BookOpen, GraduationCap, Loader2, ClipboardCopy, RotateCcw, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { cn } from "../lib/utils";
import { ScrollArea } from "../components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
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

  const { data: subjects, isLoading: subjectsLoading } = useATPSubjects(selectedGrade);
  const { data: topics, isLoading: topicsLoading } = useATPTopics(selectedGrade, selectedSubject);

  const [quizSession, setQuizSession] = useState<QuizSession | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<(number | null)[]>([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const generateQuiz = useGenerateQuiz();
  const submitQuiz = useSubmitQuiz();

  const selectedTopic = topics?.find(t => t.id === selectedTopicId);

  useEffect(() => {
    if (subjects && subjects.length > 0) {
      if (subjects.includes("Mathematics")) {
        setSelectedSubject("Mathematics");
      } else {
        setSelectedSubject(subjects[0]);
      }
    }
  }, [subjects]);

  const handleGradeChange = (val: string) => {
    setSelectedGrade(Number(val));
    setSelectedTopicId(null);
    resetQuiz();
  };

  const handleSubjectChange = (val: string) => {
    setSelectedSubject(val);
    setSelectedTopicId(null);
    resetQuiz();
  };

  const handleTopicSelect = (id: number) => {
    setSelectedTopicId(id);
    resetQuiz();
  };

  const resetQuiz = () => {
    setQuizSession(null);
    setSelectedAnswers([]);
    setQuizSubmitted(false);
  };

  const handleGenerateQuiz = () => {
    if (!selectedTopicId) return;
    resetQuiz();
    generateQuiz.mutate({ topicId: selectedTopicId }, {
      onSuccess: (data) => {
        setQuizSession(data);
        const questions = data.questions as QuizQuestion[];
        setSelectedAnswers(new Array(questions.length).fill(null));
      },
    });
  };

  const handleSubmitQuiz = () => {
    if (!quizSession) return;
    const answers = selectedAnswers.map(a => a ?? -1);
    submitQuiz.mutate({ quizId: quizSession.id, answers }, {
      onSuccess: (data) => {
        setQuizSession(data);
        setQuizSubmitted(true);
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to submit quiz.", variant: "destructive" });
      },
    });
  };

  const handleShareQuiz = async () => {
    if (!quizSession?.shareToken) return;
    try {
      const configRes = await fetch(apiUrl("/api/share-config"));
      const config = configRes.ok ? await configRes.json() : {};
      const baseUrl = config.customDomain
        ? `https://${config.customDomain}`
        : window.location.origin;
      const url = baseUrl + "/quiz/" + quizSession.shareToken;
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied!", description: "Share this link with friends." });
    } catch {
      const url = window.location.origin + "/quiz/" + quizSession.shareToken;
      navigator.clipboard.writeText(url).then(() => {
        toast({ title: "Link copied!", description: "Share this link with friends." });
      });
    }
  };

  const handleSelectAnswer = (questionIndex: number, optionIndex: number) => {
    if (quizSubmitted) return;
    setSelectedAnswers(prev => {
      const next = [...prev];
      next[questionIndex] = optionIndex;
      return next;
    });
  };

  const questions = quizSession ? (quizSession.questions as QuizQuestion[]) : [];
  const allAnswered = selectedAnswers.length > 0 && selectedAnswers.every(a => a !== null);

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col md:flex-row gap-6">
      <div className="w-full md:w-80 flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1" data-testid="text-learning-path-title">Learning Path</h1>
          <p className="text-sm text-muted-foreground mb-3">South African CAPS Curriculum</p>
          <div className="flex gap-2">
            <Select
              value={String(selectedGrade)}
              onValueChange={handleGradeChange}
            >
              <SelectTrigger className="w-full" data-testid="select-grade">
                <SelectValue placeholder="Select Grade" />
              </SelectTrigger>
              <SelectContent>
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(g => (
                  <SelectItem key={g} value={String(g)}>Grade {g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={selectedSubject}
              onValueChange={handleSubjectChange}
              disabled={subjectsLoading || !subjects || subjects.length === 0}
            >
              <SelectTrigger className="w-full" data-testid="select-subject">
                <SelectValue placeholder="Select Subject" />
              </SelectTrigger>
              <SelectContent>
                {subjects?.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="flex-1 overflow-hidden border-slate-200 dark:border-slate-700 flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              {topicsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                [1, 2, 3, 4].map(term => {
                  const termTopics = topics?.filter(t => t.term === term) || [];
                  if (termTopics.length === 0) return null;

                  return (
                    <div key={term} className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 pl-2 border-l-2 border-primary">
                        Term {term}
                      </h3>
                      <div className="space-y-1">
                        {termTopics.map(topic => (
                          <button
                            key={topic.id}
                            onClick={() => handleTopicSelect(topic.id)}
                            className={cn(
                              "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-between group",
                              selectedTopicId === topic.id
                                ? "bg-primary/10 text-primary font-medium dark:bg-primary/20"
                                : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                            )}
                            data-testid={`button-topic-${topic.id}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <BookOpen className="w-3.5 h-3.5 shrink-0 opacity-50" />
                              <span className="truncate">{topic.topic}</span>
                            </div>
                            {selectedTopicId === topic.id && (
                              <ChevronRight className="w-4 h-4 text-primary shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}

              {!topicsLoading && (!topics || topics.length === 0) && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No topics available for Grade {selectedGrade} {selectedSubject} yet.
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>

      <div className="flex-1 flex flex-col">
        {selectedTopic ? (
          <Card className="flex-1 border-slate-200 dark:border-slate-700 shadow-md flex flex-col overflow-hidden">
            <CardHeader className="border-b bg-slate-50/50 dark:bg-slate-900/50 pb-4">
              <div className="flex justify-between items-start flex-wrap gap-2">
                <div>
                  <div className="text-xs font-semibold text-primary mb-1">
                    Grade {selectedGrade} • {selectedSubject} • Term {selectedTopic.term} • Week {selectedTopic.week}
                  </div>
                  <CardTitle className="text-2xl" data-testid="text-topic-title">{selectedTopic.topic}</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-6">
              {selectedTopic.content ? (
                <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:text-primary/90 prose-h2:text-xl prose-h3:text-lg" data-testid="topic-content">
                  <ReactMarkdown
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {selectedTopic.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                  <p>Content coming soon for this topic.</p>
                </div>
              )}

              <div className="mt-8 border-t pt-6">
                {!quizSession && !generateQuiz.isPending && (
                  <Button
                    onClick={handleGenerateQuiz}
                    data-testid="button-take-quiz"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Take Quiz
                  </Button>
                )}

                {generateQuiz.isPending && (
                  <div className="flex items-center gap-3 text-muted-foreground py-4" data-testid="quiz-loading">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Generating quiz questions...</span>
                  </div>
                )}

                {quizSession && questions.length > 0 && (
                  <div className="space-y-6" data-testid="quiz-section">
                    <h3 className="text-lg font-semibold">Quiz</h3>

                    {quizSubmitted && quizSession.score !== null && quizSession.percentage !== null && (
                      <Card className="border-slate-200 dark:border-slate-700">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4 flex-wrap">
                            <div className="text-center">
                              <div className="text-3xl font-bold" data-testid="text-quiz-score">
                                {quizSession.score}/{questions.length}
                              </div>
                              <div className="text-sm text-muted-foreground">Score</div>
                            </div>
                            <div className="text-center">
                              <div className={cn(
                                "text-3xl font-bold",
                                quizSession.percentage >= 70 ? "text-green-600 dark:text-green-400" : quizSession.percentage >= 50 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"
                              )} data-testid="text-quiz-percentage">
                                {quizSession.percentage}%
                              </div>
                              <div className="text-sm text-muted-foreground">Percentage</div>
                            </div>
                          </div>
                          {quizSession.feedback && (
                            <p className="mt-3 text-sm text-muted-foreground" data-testid="text-quiz-feedback">{quizSession.feedback}</p>
                          )}
                          <div className="flex gap-2 mt-4 flex-wrap">
                            <Button variant="outline" onClick={handleShareQuiz} data-testid="button-share-quiz">
                              <ClipboardCopy className="w-4 h-4 mr-2" />
                              Share Quiz
                            </Button>
                            <Button variant="outline" onClick={handleGenerateQuiz} data-testid="button-try-again">
                              <RotateCcw className="w-4 h-4 mr-2" />
                              Try Again
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <div className="space-y-5">
                      {questions.map((q, qi) => {
                        const userAnswer = selectedAnswers[qi];
                        const isCorrect = quizSubmitted && userAnswer === q.correctAnswer;
                        const isWrong = quizSubmitted && userAnswer !== null && userAnswer !== q.correctAnswer;

                        return (
                          <Card key={qi} className={cn(
                            "border-slate-200 dark:border-slate-700",
                            quizSubmitted && isCorrect && "border-green-300 dark:border-green-700",
                            quizSubmitted && isWrong && "border-red-300 dark:border-red-700"
                          )} data-testid={`card-question-${qi}`}>
                            <CardContent className="p-4 space-y-3">
                              <div className="flex items-start gap-2">
                                <Badge variant="secondary" className="shrink-0 mt-0.5">Q{qi + 1}</Badge>
                                <div className="text-sm font-medium flex-1 [&_p]:m-0 [&_.katex]:text-base" data-testid={`text-question-${qi}`}>
                                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{q.question}</ReactMarkdown>
                                </div>
                              </div>
                              <div className="space-y-2 pl-1">
                                {q.options.map((opt, oi) => {
                                  const label = String.fromCharCode(65 + oi);
                                  const isSelected = userAnswer === oi;
                                  const isCorrectOption = q.correctAnswer === oi;

                                  let optionClass = "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800";
                                  if (!quizSubmitted && isSelected) {
                                    optionClass = "border-primary bg-primary/5 dark:bg-primary/10";
                                  }
                                  if (quizSubmitted) {
                                    if (isCorrectOption) {
                                      optionClass = "border-green-400 bg-green-50 dark:border-green-600 dark:bg-green-950/30";
                                    } else if (isSelected && !isCorrectOption) {
                                      optionClass = "border-red-400 bg-red-50 dark:border-red-600 dark:bg-red-950/30";
                                    } else {
                                      optionClass = "border-slate-200 dark:border-slate-700 opacity-60";
                                    }
                                  }

                                  return (
                                    <button
                                      key={oi}
                                      onClick={() => handleSelectAnswer(qi, oi)}
                                      disabled={quizSubmitted}
                                      className={cn(
                                        "w-full text-left px-3 py-2 rounded-md text-sm border transition-colors flex items-center gap-2",
                                        optionClass,
                                        quizSubmitted && "cursor-default"
                                      )}
                                      data-testid={`button-option-${qi}-${oi}`}
                                    >
                                      <span className="font-medium shrink-0 w-5">{label}.</span>
                                      <div className="flex-1 [&_p]:m-0 [&_.katex]:text-sm"><ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={{ p: ({children}) => <span>{children}</span> }}>{opt.replace(/^[A-D][).:‐\-]\s*/i, '')}</ReactMarkdown></div>
                                      {quizSubmitted && isCorrectOption && (
                                        <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                                      )}
                                      {quizSubmitted && isSelected && !isCorrectOption && (
                                        <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                              {quizSubmitted && q.explanation && (
                                <div className="text-sm text-muted-foreground bg-slate-50 dark:bg-slate-900/50 rounded-md p-3 mt-2 [&_p]:inline [&_p]:m-0 [&_.katex]:text-sm" data-testid={`text-explanation-${qi}`}>
                                  <span className="font-medium">Explanation: </span>
                                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{q.explanation}</ReactMarkdown>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>

                    {!quizSubmitted && (
                      <Button
                        onClick={handleSubmitQuiz}
                        disabled={!allAnswered || submitQuiz.isPending}
                        data-testid="button-submit-quiz"
                      >
                        {submitQuiz.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          "Submit Quiz"
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 dark:bg-slate-900/50 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700">
            <GraduationCap className="w-16 h-16 mb-4 opacity-20" />
            <h3 className="text-lg font-medium text-slate-600 dark:text-slate-300">Select a topic to start learning</h3>
            <p className="max-w-xs text-center mt-2 text-sm text-slate-500 dark:text-slate-400">
              Navigate through the terms and weeks on the left to find your current curriculum topic.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
