import {
  users,
  textbooks,
  annotations,
  helpRequests,
  chatSessions,
  chatMessages,
  sessionParticipants,
  atpTopics,
  diagnosticTests,
  testResults,
  tutorSessions,
  passwordResetTokens,
  tutorRates,
  paymentMethods,
  payments,
  platformSettings,
  tutorBankDetails,
  quizSessions,
  announcements,
  tutorAvailability,
  liveClasses,
  liveClassMessages,
  sessionRecordings,
  type User,
  type InsertUser,
  type Textbook,
  type Annotation,
  type HelpRequest,
  type ChatSession,
  type ChatMessage,
  type SessionParticipant,
  type ATPTopic,
  type DiagnosticTest,
  type TestResult,
  type TutorSession,
  type TutorRate,
  type PaymentMethod,
  type Payment,
  type TutorBankDetails,
  type QuizSession,
  type Announcement,
  type TutorAvailability,
  type LiveClass,
  type LiveClassMessage,
  type SessionRecording,
  type InsertSessionRecording,
} from "@shared/schema";

import { db, pool } from "./db";
import { eq, and, desc, gt, inArray, sql } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  sessionStore: session.Store;

  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  // USERS
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
}

export const storage = new DatabaseStorage();
