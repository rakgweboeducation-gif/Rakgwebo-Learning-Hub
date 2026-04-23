import { 
  users, textbooks, annotations, helpRequests, chatSessions, chatMessages, sessionParticipants,
  atpTopics, diagnosticTests, testResults, tutorSessions, passwordResetTokens,
  tutorRates, paymentMethods, payments, platformSettings, tutorBankDetails,
  quizSessions, announcements, tutorAvailability, activityLogs, liveClasses, liveClassMessages,
  sessionRecordings,
  type User, type InsertUser, type Textbook, type Annotation, type HelpRequest,
  type ChatSession, type ChatMessage, type SessionParticipant, type ATPTopic, type DiagnosticTest,
  type TestResult, type TutorSession, type TutorRate, type PaymentMethod, type Payment,
  type TutorBankDetails, type QuizSession, type Announcement, type TutorAvailability,
  type ActivityLog, type InsertActivityLog, type LiveClass, type LiveClassMessage,
  type SessionRecording, type InsertSessionRecording
} from "@shared/schema";
import { db, pool } from "./db";
import { eq, and, desc, or, gt, inArray, sql } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  sessionStore: session.Store;
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User>;
  listTutors(): Promise<User[]>;
  getAllUsers(): Promise<User[]>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createPasswordResetToken(userId: number, token: string, expiresAt: Date): Promise<void>;
  getPasswordResetToken(token: string): Promise<{ id: number; userId: number; token: string; expiresAt: Date; used: boolean | null } | undefined>;
  markPasswordResetTokenUsed(id: number): Promise<void>;

  // Textbooks
  getTextbooks(grade?: number): Promise<Textbook[]>;
  getTextbook(id: number): Promise<Textbook | undefined>;
  createTextbook(textbook: Omit<Textbook, "id">): Promise<Textbook>;

  // Annotations
  getAnnotations(userId: number, textbookId?: number): Promise<Annotation[]>;
  createAnnotation(annotation: Omit<Annotation, "id" | "createdAt">): Promise<Annotation>;
  deleteAnnotation(id: number): Promise<void>;

  // Help Requests
  createHelpRequest(request: Omit<HelpRequest, "id" | "createdAt">): Promise<HelpRequest>;
  getHelpRequests(tutorId?: number): Promise<HelpRequest[]>; // If tutorId, filter by tutor or open
  updateHelpRequest(id: number, updates: Partial<HelpRequest>): Promise<HelpRequest>;

  // ATP
  getATPTopics(grade?: number, term?: number, subject?: string): Promise<ATPTopic[]>;
  getATPSubjects(grade?: number): Promise<string[]>;
  getDiagnosticTest(topicId: number): Promise<DiagnosticTest | undefined>;
  submitTestResult(result: Omit<TestResult, "id" | "completedAt">): Promise<TestResult>;

  // Tutor Sessions
  createTutorSession(session: Omit<TutorSession, "id">): Promise<TutorSession>;
  getTutorSession(id: number): Promise<TutorSession | undefined>;
  getTutorSessions(userId: number, role: "learner" | "tutor"): Promise<TutorSession[]>;
  updateTutorSession(id: number, updates: Partial<TutorSession>): Promise<TutorSession>;

  // Tutor Rates
  getTutorRate(tutorId: number): Promise<TutorRate | undefined>;
  setTutorRate(tutorId: number, hourlyRate: number): Promise<TutorRate>;

  // Payment Methods
  getPaymentMethods(userId: number): Promise<PaymentMethod[]>;
  addPaymentMethod(method: Omit<PaymentMethod, "id" | "createdAt">): Promise<PaymentMethod>;
  deletePaymentMethod(id: number, userId: number): Promise<void>;
  setDefaultPaymentMethod(id: number, userId: number): Promise<void>;

  // Payments
  createPayment(payment: Omit<Payment, "id" | "createdAt" | "capturedAt">): Promise<Payment>;
  getPayment(id: number): Promise<Payment | undefined>;
  getPaymentBySession(sessionId: number): Promise<Payment | undefined>;
  getPaymentsForUser(userId: number, role: "learner" | "tutor"): Promise<Payment[]>;
  capturePayment(id: number, amount: number, platformFee: number, tutorEarnings: number, durationMinutes: number): Promise<Payment>;
  cancelPayment(id: number): Promise<Payment>;
  refundPayment(id: number): Promise<Payment>;
  getTutorEarnings(tutorId: number): Promise<{ total: number; pending: number; completed: number; sessionsCount: number }>;

  // Tutor Bank Details
  getTutorBankDetails(tutorId: number): Promise<TutorBankDetails | undefined>;
  saveTutorBankDetails(details: Omit<TutorBankDetails, "id" | "updatedAt">): Promise<TutorBankDetails>;

  // Tutor Availability
  getTutorAvailability(tutorId: number): Promise<TutorAvailability[]>;
  setTutorAvailability(tutorId: number, slots: Omit<TutorAvailability, "id">[]): Promise<TutorAvailability[]>;

  // Session auto-completion
  completeExpiredSessions(): Promise<number>;
  captureOrphanedPayments(): Promise<number>;

  // Platform Settings
  getPlatformSetting(key: string): Promise<string | undefined>;
  setPlatformSetting(key: string, value: string): Promise<void>;
  getAllPlatformSettings(): Promise<Record<string, string>>;

  // Chat
  createChatSession(data: { name?: string; type?: string }): Promise<ChatSession>;
  getChatSession(id: number): Promise<ChatSession | undefined>;
  getUserChatSessions(userId: number): Promise<(ChatSession & { participants: User[]; lastMessage?: ChatMessage })[]>;
  addSessionParticipant(sessionId: number, userId: number): Promise<SessionParticipant>;
  getSessionParticipants(sessionId: number): Promise<User[]>;
  findDirectSession(userId1: number, userId2: number): Promise<ChatSession | undefined>;
  getChatMessages(sessionId: number, afterId?: number): Promise<ChatMessage[]>;
  createChatMessage(message: Omit<ChatMessage, "id" | "createdAt">): Promise<ChatMessage>;
  updateWhiteboardData(sessionId: number, data: any): Promise<ChatSession>;
  searchUsers(query: string, excludeUserId: number): Promise<User[]>;
  markSessionRead(sessionId: number, userId: number, lastMessageId: number): Promise<void>;
  getUnreadCounts(userId: number): Promise<Record<number, number>>;

  // Quizzes
  createQuizSession(data: Omit<QuizSession, "id" | "createdAt" | "completedAt">): Promise<QuizSession>;
  getQuizSession(id: number): Promise<QuizSession | undefined>;
  getQuizSessionByToken(token: string): Promise<QuizSession | undefined>;
  submitQuiz(id: number, answers: any, score: number, percentage: number, feedback: string): Promise<QuizSession>;
  getUserQuizHistory(userId: number, topicId?: number): Promise<QuizSession[]>;

  // Announcements
  createAnnouncement(data: Omit<Announcement, "id" | "createdAt">): Promise<Announcement>;
  getAnnouncements(role?: string, grade?: number): Promise<Announcement[]>;
  deleteAnnouncement(id: number): Promise<void>;

  // Activity Logs
  logActivity(log: InsertActivityLog): Promise<ActivityLog>;
  getActivityLogs(limit?: number, offset?: number): Promise<{ logs: ActivityLog[]; total: number }>;

  // Live Classes
  createLiveClass(data: Omit<LiveClass, "id" | "createdAt" | "endedAt">): Promise<LiveClass>;
  getLiveClass(id: number): Promise<LiveClass | undefined>;
  getLiveClasses(status?: "live" | "ended"): Promise<(LiveClass & { tutor: Pick<User, "id" | "username" | "name" | "surname" | "avatar"> })[]>;
  endLiveClass(id: number): Promise<LiveClass>;
  addLiveClassMessage(data: Omit<LiveClassMessage, "id" | "createdAt">): Promise<LiveClassMessage>;
  getLiveClassMessages(classId: number): Promise<LiveClassMessage[]>;

  // Session Recordings
  createSessionRecording(data: InsertSessionRecording): Promise<SessionRecording>;
  getSessionRecordings(sessionId: number): Promise<SessionRecording[]>;
  getUserRecordings(userId: number): Promise<SessionRecording[]>;
  deleteSessionRecording(id: number, userId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  // === USERS ===
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return user;
  }

  async listTutors(): Promise<User[]> {
    return db.select().from(users).where(and(eq(users.role, "tutor"), eq(users.isTutorApproved, true)));
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createPasswordResetToken(userId: number, token: string, expiresAt: Date): Promise<void> {
    await db.insert(passwordResetTokens).values({ userId, token, expiresAt });
  }

  async getPasswordResetToken(token: string) {
    const [result] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token));
    return result;
  }

  async markPasswordResetTokenUsed(id: number): Promise<void> {
    await db.update(passwordResetTokens).set({ used: true }).where(eq(passwordResetTokens.id, id));
  }

  // === TEXTBOOKS ===
  async getTextbooks(grade?: number): Promise<Textbook[]> {
    if (grade) {
      return db.select().from(textbooks).where(eq(textbooks.grade, grade));
    }
    return db.select().from(textbooks);
  }

  async getTextbook(id: number): Promise<Textbook | undefined> {
    const [book] = await db.select().from(textbooks).where(eq(textbooks.id, id));
    return book;
  }

  async createTextbook(textbook: Omit<Textbook, "id">): Promise<Textbook> {
    const [book] = await db.insert(textbooks).values(textbook).returning();
    return book;
  }

  // === ANNOTATIONS ===
  async getAnnotations(userId: number, textbookId?: number): Promise<Annotation[]> {
    if (textbookId) {
      return db.select().from(annotations).where(and(eq(annotations.userId, userId), eq(annotations.textbookId, textbookId)));
    }
    return db.select().from(annotations).where(eq(annotations.userId, userId));
  }

  async createAnnotation(annotation: Omit<Annotation, "id" | "createdAt">): Promise<Annotation> {
    if (annotation.type === "drawing") {
      await db.delete(annotations).where(and(
        eq(annotations.userId, annotation.userId),
        eq(annotations.textbookId, annotation.textbookId),
        eq(annotations.page, annotation.page),
        eq(annotations.type, "drawing")
      ));
    }
    const [note] = await db.insert(annotations).values(annotation).returning();
    return note;
  }

  async deleteAnnotation(id: number): Promise<void> {
    await db.delete(annotations).where(eq(annotations.id, id));
  }

  // === HELP REQUESTS ===
  async createHelpRequest(request: Omit<HelpRequest, "id" | "createdAt">): Promise<HelpRequest> {
    const [req] = await db.insert(helpRequests).values(request).returning();
    return req;
  }

  async getHelpRequests(tutorId?: number): Promise<HelpRequest[]> {
    // Return all for now, simplified
    return db.select().from(helpRequests).orderBy(desc(helpRequests.createdAt));
  }

  async updateHelpRequest(id: number, updates: Partial<HelpRequest>): Promise<HelpRequest> {
    const [req] = await db.update(helpRequests).set(updates).where(eq(helpRequests.id, id)).returning();
    return req;
  }

  // === ATP ===
  async getATPTopics(grade?: number, term?: number, subject?: string): Promise<ATPTopic[]> {
    const conditions = [];
    if (grade !== undefined) conditions.push(eq(atpTopics.grade, grade));
    if (subject !== undefined && subject !== '') conditions.push(eq(atpTopics.subject, subject));
    if (term !== undefined) conditions.push(eq(atpTopics.term, term));
    if (conditions.length === 1) {
      return db.select().from(atpTopics).where(conditions[0]);
    } else if (conditions.length > 1) {
      return db.select().from(atpTopics).where(and(...conditions));
    }
    return db.select().from(atpTopics);
  }

  async getATPSubjects(grade?: number): Promise<string[]> {
    let query;
    if (grade) {
      query = db.selectDistinct({ subject: atpTopics.subject }).from(atpTopics).where(eq(atpTopics.grade, grade));
    } else {
      query = db.selectDistinct({ subject: atpTopics.subject }).from(atpTopics);
    }
    const result = await query;
    return result.map(r => r.subject);
  }

  async getDiagnosticTest(topicId: number): Promise<DiagnosticTest | undefined> {
    const [test] = await db.select().from(diagnosticTests).where(eq(diagnosticTests.topicId, topicId));
    return test;
  }

  async submitTestResult(result: Omit<TestResult, "id" | "completedAt">): Promise<TestResult> {
    const [res] = await db.insert(testResults).values(result).returning();
    return res;
  }

  // === TUTOR SESSIONS ===
  async createTutorSession(session: Omit<TutorSession, "id">): Promise<TutorSession> {
    const [s] = await db.insert(tutorSessions).values(session).returning();
    return s;
  }

  async getTutorSession(id: number): Promise<TutorSession | undefined> {
    const [s] = await db.select().from(tutorSessions).where(eq(tutorSessions.id, id));
    return s;
  }

  async getTutorSessions(userId: number, role: "learner" | "tutor"): Promise<TutorSession[]> {
    if (role === "tutor") {
      return db.select().from(tutorSessions).where(eq(tutorSessions.tutorId, userId));
    }
    return db.select().from(tutorSessions).where(eq(tutorSessions.learnerId, userId));
  }

  async updateTutorSession(id: number, updates: Partial<TutorSession>): Promise<TutorSession> {
    const [s] = await db.update(tutorSessions).set(updates).where(eq(tutorSessions.id, id)).returning();
    return s;
  }

  // === CHAT ===
  async createChatSession(data: { name?: string; type?: string }): Promise<ChatSession> {
    const [session] = await db.insert(chatSessions).values(data).returning();
    return session;
  }

  async getChatSession(id: number): Promise<ChatSession | undefined> {
    const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, id));
    return session;
  }

  async getUserChatSessions(userId: number): Promise<(ChatSession & { participants: User[]; lastMessage?: ChatMessage })[]> {
    const participantRows = await db.select().from(sessionParticipants).where(eq(sessionParticipants.userId, userId));
    const sessionIds = participantRows.map(p => p.sessionId);
    if (sessionIds.length === 0) return [];

    const sessions = await db.select().from(chatSessions).where(inArray(chatSessions.id, sessionIds));

    const result: (ChatSession & { participants: User[]; lastMessage?: ChatMessage })[] = [];
    for (const s of sessions) {
      const parts = await this.getSessionParticipants(s.id);
      const [lastMsg] = await db.select().from(chatMessages)
        .where(eq(chatMessages.sessionId, s.id))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);
      result.push({ ...s, participants: parts, lastMessage: lastMsg || undefined });
    }

    result.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt?.getTime() || a.createdAt?.getTime() || 0;
      const bTime = b.lastMessage?.createdAt?.getTime() || b.createdAt?.getTime() || 0;
      return bTime - aTime;
    });

    return result;
  }

  async addSessionParticipant(sessionId: number, userId: number): Promise<SessionParticipant> {
    const [p] = await db.insert(sessionParticipants).values({ sessionId, userId }).returning();
    return p;
  }

  async getSessionParticipants(sessionId: number): Promise<User[]> {
    const parts = await db.select().from(sessionParticipants).where(eq(sessionParticipants.sessionId, sessionId));
    const userIds = parts.map(p => p.userId);
    if (userIds.length === 0) return [];
    return db.select().from(users).where(inArray(users.id, userIds));
  }

  async findDirectSession(userId1: number, userId2: number): Promise<ChatSession | undefined> {
    const user1Sessions = await db.select().from(sessionParticipants).where(eq(sessionParticipants.userId, userId1));
    const user2Sessions = await db.select().from(sessionParticipants).where(eq(sessionParticipants.userId, userId2));
    const user1SessionIds = new Set(user1Sessions.map(p => p.sessionId));
    const commonSessionIds = user2Sessions.filter(p => user1SessionIds.has(p.sessionId)).map(p => p.sessionId);
    
    if (commonSessionIds.length === 0) return undefined;
    
    const directSessions = await db.select().from(chatSessions)
      .where(and(inArray(chatSessions.id, commonSessionIds), eq(chatSessions.type, "direct")));
    
    return directSessions[0];
  }

  async getChatMessages(sessionId: number, afterId?: number): Promise<ChatMessage[]> {
    if (afterId) {
      return db.select().from(chatMessages)
        .where(and(eq(chatMessages.sessionId, sessionId), gt(chatMessages.id, afterId)))
        .orderBy(chatMessages.id);
    }
    return db.select().from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.id);
  }

  async createChatMessage(message: Omit<ChatMessage, "id" | "createdAt">): Promise<ChatMessage> {
    const [msg] = await db.insert(chatMessages).values(message).returning();
    return msg;
  }

  async updateWhiteboardData(sessionId: number, data: any): Promise<ChatSession> {
    const [s] = await db.update(chatSessions).set({ whiteboardData: data }).where(eq(chatSessions.id, sessionId)).returning();
    return s;
  }

  async searchUsers(query: string, excludeUserId: number): Promise<User[]> {
    const allUsers = await db.select().from(users);
    const lowerQuery = query.toLowerCase().trim();
    return allUsers.filter(u => {
      if (u.id === excludeUserId) return false;
      const fullName = [u.name, u.surname].filter(Boolean).join(" ").toLowerCase();
      return (
        u.username.toLowerCase().includes(lowerQuery) ||
        (u.name && u.name.toLowerCase().includes(lowerQuery)) ||
        (u.surname && u.surname.toLowerCase().includes(lowerQuery)) ||
        (u.email && u.email.toLowerCase().includes(lowerQuery)) ||
        fullName.includes(lowerQuery)
      );
    });
  }

  async markSessionRead(sessionId: number, userId: number, lastMessageId: number): Promise<void> {
    await db.update(sessionParticipants)
      .set({ lastReadMessageId: lastMessageId })
      .where(and(
        eq(sessionParticipants.sessionId, sessionId),
        eq(sessionParticipants.userId, userId)
      ));
  }

  async getUnreadCounts(userId: number): Promise<Record<number, number>> {
    const participantRows = await db.select().from(sessionParticipants)
      .where(eq(sessionParticipants.userId, userId));
    if (participantRows.length === 0) return {};

    const counts: Record<number, number> = {};
    for (const p of participantRows) {
      const lastRead = p.lastReadMessageId || 0;
      const result = await db.select({ count: sql<number>`count(*)::int` })
        .from(chatMessages)
        .where(and(
          eq(chatMessages.sessionId, p.sessionId),
          gt(chatMessages.id, lastRead),
          sql`${chatMessages.senderId} != ${userId}`
        ));
      const unread = result[0]?.count || 0;
      if (unread > 0) counts[p.sessionId] = unread;
    }
    return counts;
  }

  // === TUTOR RATES ===
  async getTutorRate(tutorId: number): Promise<TutorRate | undefined> {
    const [rate] = await db.select().from(tutorRates).where(eq(tutorRates.tutorId, tutorId));
    return rate;
  }

  async setTutorRate(tutorId: number, hourlyRate: number): Promise<TutorRate> {
    const existing = await this.getTutorRate(tutorId);
    if (existing) {
      const [rate] = await db.update(tutorRates).set({ hourlyRate }).where(eq(tutorRates.tutorId, tutorId)).returning();
      return rate;
    }
    const [rate] = await db.insert(tutorRates).values({ tutorId, hourlyRate }).returning();
    return rate;
  }

  // === PAYMENT METHODS ===
  async getPaymentMethods(userId: number): Promise<PaymentMethod[]> {
    return db.select().from(paymentMethods).where(eq(paymentMethods.userId, userId));
  }

  async addPaymentMethod(method: Omit<PaymentMethod, "id" | "createdAt">): Promise<PaymentMethod> {
    if (method.isDefault) {
      await db.update(paymentMethods).set({ isDefault: false }).where(eq(paymentMethods.userId, method.userId));
    }
    const [pm] = await db.insert(paymentMethods).values(method).returning();
    return pm;
  }

  async deletePaymentMethod(id: number, userId: number): Promise<void> {
    await db.delete(paymentMethods).where(and(eq(paymentMethods.id, id), eq(paymentMethods.userId, userId)));
  }

  async setDefaultPaymentMethod(id: number, userId: number): Promise<void> {
    await db.update(paymentMethods).set({ isDefault: false }).where(eq(paymentMethods.userId, userId));
    await db.update(paymentMethods).set({ isDefault: true }).where(and(eq(paymentMethods.id, id), eq(paymentMethods.userId, userId)));
  }

  // === PAYMENTS ===
  async createPayment(payment: Omit<Payment, "id" | "createdAt" | "capturedAt">): Promise<Payment> {
    const [p] = await db.insert(payments).values(payment).returning();
    return p;
  }

  async getPayment(id: number): Promise<Payment | undefined> {
    const [p] = await db.select().from(payments).where(eq(payments.id, id));
    return p;
  }

  async getPaymentBySession(sessionId: number): Promise<Payment | undefined> {
    const [p] = await db.select().from(payments).where(eq(payments.sessionId, sessionId));
    return p;
  }

  async getPaymentsForUser(userId: number, role: "learner" | "tutor"): Promise<Payment[]> {
    if (role === "tutor") {
      return db.select().from(payments).where(eq(payments.tutorId, userId)).orderBy(desc(payments.createdAt));
    }
    return db.select().from(payments).where(eq(payments.learnerId, userId)).orderBy(desc(payments.createdAt));
  }

  async capturePayment(id: number, amount: number, platformFee: number, tutorEarnings: number, durationMinutes: number): Promise<Payment> {
    const [p] = await db.update(payments).set({
      status: "captured",
      amount,
      platformFee,
      tutorEarnings,
      durationMinutes,
      capturedAt: new Date(),
    }).where(eq(payments.id, id)).returning();
    return p;
  }

  async cancelPayment(id: number): Promise<Payment> {
    const [p] = await db.update(payments).set({ status: "cancelled" }).where(eq(payments.id, id)).returning();
    return p;
  }

  async refundPayment(id: number): Promise<Payment> {
    const [p] = await db.update(payments).set({ status: "refunded" }).where(eq(payments.id, id)).returning();
    return p;
  }

  async getTutorEarnings(tutorId: number): Promise<{ total: number; pending: number; completed: number; sessionsCount: number }> {
    const allPayments = await db.select().from(payments).where(eq(payments.tutorId, tutorId));
    const captured = allPayments.filter(p => p.status === "captured");
    const authorized = allPayments.filter(p => p.status === "authorized");
    return {
      total: captured.reduce((sum, p) => sum + p.tutorEarnings, 0),
      pending: authorized.reduce((sum, p) => sum + p.tutorEarnings, 0),
      completed: captured.length,
      sessionsCount: allPayments.length,
    };
  }
  async getPlatformSetting(key: string): Promise<string | undefined> {
    const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, key));
    return row?.value;
  }

  async setPlatformSetting(key: string, value: string): Promise<void> {
    const existing = await this.getPlatformSetting(key);
    if (existing !== undefined) {
      await db.update(platformSettings).set({ value, updatedAt: new Date() }).where(eq(platformSettings.key, key));
    } else {
      await db.insert(platformSettings).values({ key, value });
    }
  }

  async getAllPlatformSettings(): Promise<Record<string, string>> {
    const rows = await db.select().from(platformSettings);
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  async getTutorBankDetails(tutorId: number): Promise<TutorBankDetails | undefined> {
    const [details] = await db.select().from(tutorBankDetails).where(eq(tutorBankDetails.tutorId, tutorId));
    return details;
  }

  async saveTutorBankDetails(details: Omit<TutorBankDetails, "id" | "updatedAt">): Promise<TutorBankDetails> {
    const existing = await this.getTutorBankDetails(details.tutorId);
    if (existing) {
      const [updated] = await db.update(tutorBankDetails)
        .set({ ...details, updatedAt: new Date() })
        .where(eq(tutorBankDetails.tutorId, details.tutorId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(tutorBankDetails).values(details).returning();
    return created;
  }

  // === TUTOR AVAILABILITY ===
  async getTutorAvailability(tutorId: number): Promise<TutorAvailability[]> {
    return db.select().from(tutorAvailability).where(eq(tutorAvailability.tutorId, tutorId));
  }

  async setTutorAvailability(tutorId: number, slots: Omit<TutorAvailability, "id">[]): Promise<TutorAvailability[]> {
    await db.delete(tutorAvailability).where(eq(tutorAvailability.tutorId, tutorId));
    if (slots.length === 0) return [];
    const inserted = await db.insert(tutorAvailability).values(slots).returning();
    return inserted;
  }

  async completeExpiredSessions(): Promise<number> {
    const now = new Date();
    const expiredSessions = await db.select().from(tutorSessions)
      .where(
        and(
          eq(tutorSessions.status, "accepted"),
          sql`${tutorSessions.endTime} <= ${now}`
        )
      );

    if (expiredSessions.length === 0) return 0;

    for (const session of expiredSessions) {
      const payment = await this.getPaymentBySession(session.id);

      if (payment && payment.status === "authorized") {
        const startTime = new Date(session.startTime);
        const endTime = new Date(session.endTime);
        const durationMinutes = Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / 60000));

        const sessionCost = Math.round((payment.hourlyRate / 60) * durationMinutes);
        const platformFee = Math.round(sessionCost * 0.15);
        const totalAmount = sessionCost + platformFee;
        const tutorEarnings = sessionCost;

        await this.capturePayment(payment.id, totalAmount, platformFee, tutorEarnings, durationMinutes);
      }

      await db.update(tutorSessions)
        .set({ status: "completed", actualDurationMinutes: Math.max(1, Math.round((new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 60000)) })
        .where(eq(tutorSessions.id, session.id));
    }

    return expiredSessions.length;
  }

  async captureOrphanedPayments(): Promise<number> {
    const completedSessions = await db.select().from(tutorSessions)
      .where(eq(tutorSessions.status, "completed"));

    let captured = 0;
    for (const session of completedSessions) {
      const payment = await this.getPaymentBySession(session.id);
      if (payment && payment.status === "authorized") {
        const startTime = new Date(session.startTime);
        const endTime = new Date(session.endTime);
        const durationMinutes = Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / 60000));

        const sessionCost = Math.round((payment.hourlyRate / 60) * durationMinutes);
        const platformFee = Math.round(sessionCost * 0.15);
        const totalAmount = sessionCost + platformFee;
        const tutorEarnings = sessionCost;

        await this.capturePayment(payment.id, totalAmount, platformFee, tutorEarnings, durationMinutes);
        captured++;
      }
    }
    return captured;
  }

  // === QUIZZES ===
  async createQuizSession(data: Omit<QuizSession, "id" | "createdAt" | "completedAt">): Promise<QuizSession> {
    const [session] = await db.insert(quizSessions).values(data).returning();
    return session;
  }

  async getQuizSession(id: number): Promise<QuizSession | undefined> {
    const [session] = await db.select().from(quizSessions).where(eq(quizSessions.id, id));
    return session;
  }

  async getQuizSessionByToken(token: string): Promise<QuizSession | undefined> {
    const [session] = await db.select().from(quizSessions).where(eq(quizSessions.shareToken, token));
    return session;
  }

  async submitQuiz(id: number, answers: any, score: number, percentage: number, feedback: string): Promise<QuizSession> {
    const [session] = await db.update(quizSessions)
      .set({ answers, score, percentage, feedback, completedAt: new Date() })
      .where(eq(quizSessions.id, id))
      .returning();
    return session;
  }

  async getUserQuizHistory(userId: number, topicId?: number): Promise<QuizSession[]> {
    if (topicId) {
      return db.select().from(quizSessions)
        .where(and(eq(quizSessions.userId, userId), eq(quizSessions.topicId, topicId)))
        .orderBy(desc(quizSessions.createdAt));
    }
    return db.select().from(quizSessions)
      .where(eq(quizSessions.userId, userId))
      .orderBy(desc(quizSessions.createdAt));
  }

  // === ANNOUNCEMENTS ===
  async createAnnouncement(data: Omit<Announcement, "id" | "createdAt">): Promise<Announcement> {
    const [announcement] = await db.insert(announcements).values(data).returning();
    return announcement;
  }

  async getAnnouncements(role?: string, grade?: number): Promise<Announcement[]> {
    const allAnnouncements = await db.select().from(announcements).orderBy(desc(announcements.createdAt));
    if (!role) return allAnnouncements;
    return allAnnouncements.filter(a => {
      const roles = a.targetRoles as string[];
      if (!roles.includes(role)) return false;
      if (grade && a.targetGrades) {
        const grades = a.targetGrades as number[];
        if (grades.length > 0 && !grades.includes(grade)) return false;
      }
      return true;
    });
  }

  async deleteAnnouncement(id: number): Promise<void> {
    await db.delete(announcements).where(eq(announcements.id, id));
  }

  async logActivity(log: InsertActivityLog): Promise<ActivityLog> {
    const [result] = await db.insert(activityLogs).values(log).returning();
    return result;
  }

  async getActivityLogs(limit: number = 50, offset: number = 0): Promise<{ logs: ActivityLog[]; total: number }> {
    const logs = await db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(limit).offset(offset);
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(activityLogs);
    return { logs, total: countResult.count };
  }

  async createLiveClass(data: Omit<LiveClass, "id" | "createdAt" | "endedAt">): Promise<LiveClass> {
    const [cls] = await db.insert(liveClasses).values(data).returning();
    return cls;
  }

  async getLiveClass(id: number): Promise<LiveClass | undefined> {
    const [cls] = await db.select().from(liveClasses).where(eq(liveClasses.id, id));
    return cls;
  }

  async getLiveClasses(status?: "live" | "ended"): Promise<(LiveClass & { tutor: Pick<User, "id" | "username" | "name" | "surname" | "avatar"> })[]> {
    const rows = await db
      .select({
        id: liveClasses.id,
        tutorId: liveClasses.tutorId,
        title: liveClasses.title,
        subject: liveClasses.subject,
        description: liveClasses.description,
        grade: liveClasses.grade,
        status: liveClasses.status,
        createdAt: liveClasses.createdAt,
        endedAt: liveClasses.endedAt,
        tutorUsername: users.username,
        tutorName: users.name,
        tutorSurname: users.surname,
        tutorAvatar: users.avatar,
      })
      .from(liveClasses)
      .leftJoin(users, eq(liveClasses.tutorId, users.id))
      .where(status ? eq(liveClasses.status, status) : undefined)
      .orderBy(desc(liveClasses.createdAt));

    return rows.map(r => ({
      id: r.id,
      tutorId: r.tutorId,
      title: r.title,
      subject: r.subject,
      description: r.description,
      grade: r.grade,
      status: r.status,
      createdAt: r.createdAt,
      endedAt: r.endedAt,
      tutor: {
        id: r.tutorId,
        username: r.tutorUsername || "",
        name: r.tutorName || null,
        surname: r.tutorSurname || null,
        avatar: r.tutorAvatar || null,
      },
    }));
  }

  async endLiveClass(id: number): Promise<LiveClass> {
    const [cls] = await db
      .update(liveClasses)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(liveClasses.id, id))
      .returning();
    return cls;
  }

  async addLiveClassMessage(data: Omit<LiveClassMessage, "id" | "createdAt">): Promise<LiveClassMessage> {
    const [msg] = await db.insert(liveClassMessages).values(data).returning();
    return msg;
  }

  async getLiveClassMessages(classId: number): Promise<LiveClassMessage[]> {
    return db.select().from(liveClassMessages)
      .where(eq(liveClassMessages.classId, classId))
      .orderBy(liveClassMessages.createdAt);
  }

  // === SESSION RECORDINGS ===
  async createSessionRecording(data: InsertSessionRecording): Promise<SessionRecording> {
    const [r] = await db.insert(sessionRecordings).values(data).returning();
    return r;
  }

  async getSessionRecordings(sessionId: number): Promise<SessionRecording[]> {
    return db.select().from(sessionRecordings)
      .where(eq(sessionRecordings.sessionId, sessionId))
      .orderBy(desc(sessionRecordings.createdAt));
  }

  async getUserRecordings(userId: number): Promise<SessionRecording[]> {
    return db.select().from(sessionRecordings)
      .where(eq(sessionRecordings.userId, userId))
      .orderBy(desc(sessionRecordings.createdAt));
  }

  async deleteSessionRecording(id: number, userId: number): Promise<void> {
    await db.delete(sessionRecordings)
      .where(and(eq(sessionRecordings.id, id), eq(sessionRecordings.userId, userId)));
  }
}

export const storage = new DatabaseStorage();
