import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === USERS ===
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  password: text("password").notNull(),
  role: text("role", { enum: ["learner", "tutor", "admin"] })
    .default("learner")
    .notNull(),
  name: text("name"),
  surname: text("surname"),
  avatar: text("avatar"),
  bio: text("bio"),
  grade: integer("grade"),
  isTutorApproved: boolean("is_tutor_approved").default(false),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });

// === TEXTBOOKS ===
export const textbooks = pgTable("textbooks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  grade: integer("grade").notNull(),
  url: text("url").notNull(),
  coverUrl: text("cover_url"),
});

export const insertTextbookSchema = createInsertSchema(textbooks).omit({
  id: true,
});

// === ANNOTATIONS ===
export const annotations = pgTable("annotations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  textbookId: integer("textbook_id").notNull(),
  page: integer("page").notNull(),
  content: text("content").notNull(),
  type: text("type", { enum: ["highlight", "note", "drawing"] }).notNull(),
  color: text("color"),
  strokeWidth: integer("stroke_width"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAnnotationSchema = createInsertSchema(annotations).omit({
  id: true,
  createdAt: true,
});

// === HELP REQUESTS ===
export const helpRequests = pgTable("help_requests", {
  id: serial("id").primaryKey(),
  learnerId: integer("learner_id").notNull(),
  textbookId: integer("textbook_id"),
  page: integer("page"),
  content: text("content").notNull(),
  status: text("status", { enum: ["open", "resolved"] }).default("open"),
  tutorId: integer("tutor_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertHelpRequestSchema = createInsertSchema(helpRequests).omit({
  id: true,
  createdAt: true,
});

// === CHAT ===
export const chatSessions = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  name: text("name"),
  type: text("type", { enum: ["direct", "group"] }).default("direct"),
  createdAt: timestamp("created_at").defaultNow(),
  whiteboardData: jsonb("whiteboard_data"),
});

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  senderId: integer("sender_id").notNull(),
  content: text("content"),
  type: text("type", { enum: ["text", "audio", "image", "video"] }).default(
    "text",
  ),
  mediaUrl: text("media_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === TYPES (cleaned) ===
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Textbook = typeof textbooks.$inferSelect;
export type InsertTextbook = z.infer<typeof insertTextbookSchema>;
export type Annotation = typeof annotations.$inferSelect;
export type InsertAnnotation = z.infer<typeof insertAnnotationSchema>;
export type HelpRequest = typeof helpRequests.$inferSelect;
export type InsertHelpRequest = z.infer<typeof insertHelpRequestSchema>;
export type ChatSession = typeof chatSessions.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
