import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === USERS ===
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  password: text("password").notNull(),
  role: text("role", { enum: ["learner", "tutor", "admin"] }).default("learner").notNull(),
  name: text("name"),
  surname: text("surname"),
  avatar: text("avatar"),
  bio: text("bio"),
  grade: integer("grade"),
  isTutorApproved: boolean("is_tutor_approved").default(false),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
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

export const insertTextbookSchema = createInsertSchema(textbooks).omit({ id: true });

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

export const insertAnnotationSchema = createInsertSchema(annotations).omit({ id: true, createdAt: true });

// === HELP REQUESTS ===
export const helpRequests = pgTable("help_requests", {
  id: serial("id").primaryKey(),
  learnerId: integer("learner_id").notNull(),
  textbookId: integer("textbook_id"),
  page: integer("page"),
  content: text("content").notNull(),
  status: text("status", { enum: ["open", "resolved"] }).default("open"),
  tutorId: integer("tutor_id"), // Who resolved it
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertHelpRequestSchema = createInsertSchema(helpRequests).omit({ id: true, createdAt: true });

// === CHAT & WHITEBOARD ===
// Reusing some chat logic but customizing for this app's specific needs
export const chatSessions = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  name: text("name"),
  type: text("type", { enum: ["direct", "group"] }).default("direct"),
  createdAt: timestamp("created_at").defaultNow(),
  whiteboardData: jsonb("whiteboard_data"), // Store whiteboard state
});

export const sessionParticipants = pgTable("session_participants", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  userId: integer("user_id").notNull(),
  lastReadMessageId: integer("last_read_message_id").default(0),
});

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  senderId: integer("sender_id").notNull(),
  content: text("content"),
  type: text("type", { enum: ["text", "audio", "image", "video", "whiteboard", "file"] }).default("text"),
  mediaUrl: text("media_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertChatSessionSchema = createInsertSchema(chatSessions).omit({ id: true, createdAt: true });
export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true });
export const insertSessionParticipantSchema = createInsertSchema(sessionParticipants).omit({ id: true });


// === ATP (Annual Teaching Plan) ===
export const atpTopics = pgTable("atp_topics", {
  id: serial("id").primaryKey(),
  grade: integer("grade").notNull(),
  term: integer("term").notNull(),
  week: integer("week").notNull(),
  topic: text("topic").notNull(),
  content: text("content"),
  subject: text("subject").default("Mathematics").notNull(),
});

export const diagnosticTests = pgTable("diagnostic_tests", {
  id: serial("id").primaryKey(),
  topicId: integer("topic_id").notNull(),
  title: text("title").notNull(),
  questions: jsonb("questions").notNull(),
});

export const testResults = pgTable("test_results", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  testId: integer("test_id").notNull(),
  score: integer("score").notNull(),
  answers: jsonb("answers"),
  completedAt: timestamp("completed_at").defaultNow(),
});

// === QUIZZES (AI-generated per topic) ===
export const quizSessions = pgTable("quiz_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  topicId: integer("topic_id").notNull(),
  questions: jsonb("questions").notNull(),
  answers: jsonb("answers"),
  score: integer("score"),
  percentage: integer("percentage"),
  feedback: text("feedback"),
  shareToken: text("share_token").unique(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertQuizSessionSchema = createInsertSchema(quizSessions).omit({ id: true, createdAt: true, completedAt: true });

// === ANNOUNCEMENTS ===
export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdBy: integer("created_by").notNull(),
  targetRoles: jsonb("target_roles").$type<string[]>().notNull(),
  targetGrades: jsonb("target_grades").$type<number[]>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAnnouncementSchema = createInsertSchema(announcements).omit({ id: true, createdAt: true });

// === TUTOR SCHEDULING ===
export const tutorSessions = pgTable("tutor_sessions", {
  id: serial("id").primaryKey(),
  learnerId: integer("learner_id").notNull(),
  tutorId: integer("tutor_id").notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  status: text("status", { enum: ["requested", "accepted", "completed", "cancelled", "rejected"] }).default("requested"),
  topic: text("topic"),
  meetingLink: text("meeting_link"),
  actualDurationMinutes: integer("actual_duration_minutes"),
});

export const insertTutorSessionSchema = createInsertSchema(tutorSessions).omit({ id: true });

// === SESSION RECORDINGS ===
export const sessionRecordings = pgTable("session_recordings", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  userId: integer("user_id").notNull(),
  filePath: text("file_path").notNull(),
  durationSeconds: integer("duration_seconds"),
  fileSizeBytes: integer("file_size_bytes"),
  mimeType: text("mime_type").default("video/webm"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertSessionRecordingSchema = createInsertSchema(sessionRecordings).omit({ id: true, createdAt: true });
export type SessionRecording = typeof sessionRecordings.$inferSelect;
export type InsertSessionRecording = z.infer<typeof insertSessionRecordingSchema>;

// === TUTOR RATES ===
export const tutorRates = pgTable("tutor_rates", {
  id: serial("id").primaryKey(),
  tutorId: integer("tutor_id").notNull().unique(),
  hourlyRate: integer("hourly_rate").notNull().default(15000),
  currency: text("currency").default("ZAR").notNull(),
});

export const insertTutorRateSchema = createInsertSchema(tutorRates).omit({ id: true });

// === PAYMENT METHODS (mock for MVP) ===
export const paymentMethods = pgTable("payment_methods", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  cardLast4: text("card_last4").notNull(),
  cardBrand: text("card_brand").notNull(),
  expiryMonth: integer("expiry_month").notNull(),
  expiryYear: integer("expiry_year").notNull(),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPaymentMethodSchema = createInsertSchema(paymentMethods).omit({ id: true, createdAt: true });

// === PAYMENTS ===
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  learnerId: integer("learner_id").notNull(),
  tutorId: integer("tutor_id").notNull(),
  paymentMethodId: integer("payment_method_id"),
  amount: integer("amount").notNull(),
  platformFee: integer("platform_fee").notNull(),
  tutorEarnings: integer("tutor_earnings").notNull(),
  currency: text("currency").default("ZAR").notNull(),
  status: text("status", { enum: ["authorized", "captured", "cancelled", "refunded"] }).default("authorized").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  hourlyRate: integer("hourly_rate").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  capturedAt: timestamp("captured_at"),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true, capturedAt: true });

// === TUTOR BANK DETAILS ===
export const tutorBankDetails = pgTable("tutor_bank_details", {
  id: serial("id").primaryKey(),
  tutorId: integer("tutor_id").notNull().unique(),
  bankName: text("bank_name").notNull(),
  accountHolder: text("account_holder").notNull(),
  accountNumber: text("account_number").notNull(),
  branchCode: text("branch_code").notNull(),
  accountType: text("account_type", { enum: ["cheque", "savings", "transmission"] }).default("cheque").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTutorBankDetailsSchema = createInsertSchema(tutorBankDetails).omit({ id: true, updatedAt: true });

// === TUTOR AVAILABILITY SLOTS ===
export const tutorAvailability = pgTable("tutor_availability", {
  id: serial("id").primaryKey(),
  tutorId: integer("tutor_id").notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  isRecurring: boolean("is_recurring").default(true),
  specificDate: text("specific_date"),
});

export const insertTutorAvailabilitySchema = createInsertSchema(tutorAvailability).omit({ id: true });

// === PLATFORM SETTINGS ===
export const platformSettings = pgTable("platform_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === TYPES ===
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Textbook = typeof textbooks.$inferSelect;
export type Annotation = typeof annotations.$inferSelect;
export type HelpRequest = typeof helpRequests.$inferSelect;
export type InsertTextbook = z.infer<typeof insertTextbookSchema>;
export type Annotation = typeof annotations.$inferSelect;
export type InsertAnnotation = z.infer<typeof insertAnnotationSchema>;
export type HelpRequest = typeof helpRequests.$inferSelect;
export type InsertHelpRequest = z.infer<typeof insertHelpRequestSchema>;
export type ChatSession = typeof chatSessions.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type SessionParticipant = typeof sessionParticipants.$inferSelect;
export type ATPTopic = typeof atpTopics.$inferSelect;
export type DiagnosticTest = typeof diagnosticTests.$inferSelect;
export type TestResult = typeof testResults.$inferSelect;
export type TutorSession = typeof tutorSessions.$inferSelect;
export type InsertTutorSession = z.infer<typeof insertTutorSessionSchema>;
export type TutorRate = typeof tutorRates.$inferSelect;
export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type TutorBankDetails = typeof tutorBankDetails.$inferSelect;
export type InsertTutorBankDetails = z.infer<typeof insertTutorBankDetailsSchema>;
export type QuizSession = typeof quizSessions.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type TutorAvailability = typeof tutorAvailability.$inferSelect;
export type InsertTutorAvailability = z.infer<typeof insertTutorAvailabilitySchema>;

// === LIVE CLASSES ===
export const liveClasses = pgTable("live_classes", {
  id: serial("id").primaryKey(),
  tutorId: integer("tutor_id").notNull(),
  title: text("title").notNull(),
  subject: text("subject"),
  description: text("description"),
  grade: integer("grade"),
  status: text("status", { enum: ["live", "ended"] }).default("live").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
});

export const liveClassMessages = pgTable("live_class_messages", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull(),
  userId: integer("user_id").notNull(),
  username: text("username").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLiveClassSchema = createInsertSchema(liveClasses).omit({ id: true, createdAt: true, endedAt: true });
export const insertLiveClassMessageSchema = createInsertSchema(liveClassMessages).omit({ id: true, createdAt: true });
export type LiveClass = typeof liveClasses.$inferSelect;
export type InsertLiveClass = z.infer<typeof insertLiveClassSchema>;
export type LiveClassMessage = typeof liveClassMessages.$inferSelect;

export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  userName: text("user_name"),
  userRole: text("user_role"),
  action: text("action").notNull(),
  details: text("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true, createdAt: true });
export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
