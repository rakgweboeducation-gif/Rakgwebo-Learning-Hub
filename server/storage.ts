import {
  users,
  textbooks,
  annotations,
  helpRequests,
  chatSessions,
  chatMessages,
  type User,
  type InsertUser,
  type Textbook,
  type Annotation,
  type HelpRequest,
  type ChatSession,
  type ChatMessage,
} from "@shared/schema";

import { db, pool } from "./db";
import { eq } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";

const PostgresSessionStore = connectPg(session);

// ==========================
// INTERFACE
// ==========================
export interface IStorage {
  sessionStore: session.Store;

  // USERS
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // OPTIONAL (used in routes safely)
  logActivity?: (data: any) => Promise<void>;
}

// ==========================
// CLASS
// ==========================
export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });

    console.log("📦 Session store initialized");
  }

  // =========================
  // USERS
  // =========================

  async getUser(id: number): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    } catch (err) {
      console.error("❌ getUser failed:", err);
      return undefined;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username));
      return user;
    } catch (err) {
      console.error("❌ getUserByUsername failed:", err);
      return undefined;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      const [user] = await db.insert(users).values(insertUser).returning();
      return user;
    } catch (err) {
      console.error("❌ createUser failed:", err);
      throw err;
    }
  }

  // =========================
  // SAFE ACTIVITY LOGGER
  // =========================
  async logActivity(_data: any): Promise<void> {
    // 🔥 No-op for now (prevents crashes)
    // You can implement later when activity_logs table exists
    return;
  }
}

// ==========================
// EXPORT
// ==========================
export const storage = new DatabaseStorage();
