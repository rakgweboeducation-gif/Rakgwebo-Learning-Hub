import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  type Textbook, type InsertTextbook,
  type Annotation, type InsertAnnotation,
  type HelpRequest, type InsertHelpRequest,
  type ATPTopic, type DiagnosticTest, type TestResult,
  type ChatSession, type ChatMessage,
  type TutorSession, type InsertTutorSession,
  type QuizSession, type Announcement,
  type TutorAvailability
} from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api-config";

// === TEXTBOOKS ===
export function useTextbooks() {
  return useQuery<Textbook[]>({
    queryKey: ["/api/textbooks"],
  });
}

export function useTextbook(id: number) {
  return useQuery<Textbook>({
    queryKey: [`/api/textbooks/${id}`],
    enabled: !!id,
  });
}

// === ANNOTATIONS ===
export function useAnnotations(textbookId: number) {
  return useQuery<Annotation[]>({
    queryKey: [`/api/annotations`, { textbookId }],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/annotations?textbookId=${textbookId}`));
      if (!res.ok) throw new Error("Failed to fetch annotations");
      return res.json();
    },
    enabled: !!textbookId,
  });
}

export function useCreateAnnotation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: Omit<InsertAnnotation, "userId">) => {
      const res = await apiRequest("POST", "/api/annotations", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/annotations"] });
      toast({ title: "Annotation saved" });
    },
  });
}

// === HELP REQUESTS ===
export function useHelpRequests() {
  return useQuery<HelpRequest[]>({
    queryKey: ["/api/help-requests"],
  });
}

export function useCreateHelpRequest() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/help-requests", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/help-requests"] });
      toast({ title: "Help request submitted", description: "A tutor will review it shortly." });
    },
  });
}

export function useUpdateHelpRequest() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<HelpRequest>) => {
      const res = await apiRequest("PATCH", `/api/help-requests/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/help-requests"] });
      toast({ title: "Help request updated" });
    },
  });
}

// === ATP (LEARNING PATH) ===
export function useATPTopics(grade?: number, subject?: string) {
  return useQuery<ATPTopic[]>({
    queryKey: ["/api/atp", { grade, subject }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (grade) params.set("grade", String(grade));
      if (subject) params.set("subject", subject);
      const url = `/api/atp?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch ATP topics");
      return res.json();
    },
  });
}

export function useATPSubjects(grade?: number) {
  return useQuery<string[]>({
    queryKey: ["/api/atp/subjects", { grade }],
    queryFn: async () => {
      const url = grade ? `/api/atp/subjects?grade=${grade}` : "/api/atp/subjects";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch subjects");
      return res.json();
    },
  });
}

export function useDiagnosticTest(topicId: number) {
  return useQuery<DiagnosticTest>({
    queryKey: [`/api/atp/tests/${topicId}`],
    enabled: !!topicId,
    retry: false,
  });
}

export function useSubmitTest() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ testId, answers, score }: { testId: number, answers: any, score: number }) => {
      const res = await apiRequest("POST", `/api/atp/tests/${testId}/submit`, { answers, score });
      return res.json();
    },
    onSuccess: (data: TestResult) => {
      toast({ 
        title: "Test Submitted!", 
        description: `You scored ${data.score}% on this diagnostic test.` 
      });
    },
  });
}

// === QUIZZES ===
export function useGenerateQuiz() {
  const { toast } = useToast();
  return useMutation<QuizSession, Error, { topicId: number }>({
    mutationFn: async ({ topicId }) => {
      const res = await apiRequest("POST", "/api/quiz/generate", { topicId });
      return res.json();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate quiz. Please try again.", variant: "destructive" });
    },
  });
}

export function useSubmitQuiz() {
  const queryClient = useQueryClient();
  return useMutation<QuizSession, Error, { quizId: number; answers: number[] }>({
    mutationFn: async ({ quizId, answers }) => {
      const res = await apiRequest("POST", `/api/quiz/${quizId}/submit`, { answers });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quiz/history"] });
    },
  });
}

export function useQuizHistory(topicId?: number) {
  return useQuery<QuizSession[]>({
    queryKey: ["/api/quiz/history", { topicId }],
    queryFn: async () => {
      const url = topicId ? `/api/quiz/history?topicId=${topicId}` : "/api/quiz/history";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch quiz history");
      return res.json();
    },
  });
}

// === ANNOUNCEMENTS ===
export function useAnnouncements() {
  return useQuery<Announcement[]>({
    queryKey: ["/api/announcements"],
  });
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: { title: string; content: string; targetRoles: string[]; targetGrades?: number[] }) => {
      const res = await apiRequest("POST", "/api/announcements", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
      toast({ title: "Announcement sent" });
    },
  });
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/announcements/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
    },
  });
}

// === TUTOR SCHEDULING ===
export function useTutors() {
  return useQuery({
    queryKey: ["/api/tutors"],
  });
}

export function useTutorSessions() {
  return useQuery<TutorSession[]>({
    queryKey: ["/api/tutor-sessions"],
  });
}

export function useCreateTutorSession() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: InsertTutorSession) => {
      const res = await apiRequest("POST", "/api/tutor-sessions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tutor-sessions"] });
      toast({ title: "Session requested", description: "Waiting for tutor approval." });
    },
  });
}

export function useUpdateTutorSession() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<TutorSession>) => {
      const res = await apiRequest("PATCH", `/api/tutor-sessions/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tutor-sessions"] });
      toast({ title: "Session updated" });
    },
  });
}

// === TUTOR AVAILABILITY ===
export function useTutorAvailability(tutorId: number) {
  return useQuery<TutorAvailability[]>({
    queryKey: ["/api/tutor-availability", tutorId],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/tutor-availability/${tutorId}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch availability");
      return res.json();
    },
    enabled: !!tutorId,
  });
}

export function useSetTutorAvailability() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (slots: Omit<TutorAvailability, "id">[]) => {
      const res = await apiRequest("POST", "/api/tutor-availability", { slots });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tutor-availability"] });
      toast({ title: "Availability updated" });
    },
  });
}

// === AI ===
export function useQuickMathsQuestion() {
  return useMutation({
    mutationFn: async ({ question, grade }: { question: string, grade?: number }) => {
      const res = await apiRequest("POST", "/api/ai/quick-question", { question, grade });
      return res.json();
    },
  });
}
