import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { api } from "@shared/routes";
import { z } from "zod";
import { insertTextbookSchema, insertAnnotationSchema, insertHelpRequestSchema, insertTutorSessionSchema } from "@shared/schema";
import { insertTextbookSchema, insertAnnotationSchema, insertHelpRequestSchema, insertTutorSessionSchema, insertSessionRecordingSchema } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import { setupSessionWebSocket } from "./session-ws";
import { setupClassWebSocket } from "./class-ws";

function stripPassword(user: any) {
  if (!user) return user;
  const { password, ...safe } = user;
  return safe;
}

function logActivity(req: any, action: string, details?: string) {
  const user = req.user;
  storage.logActivity({
    userId: user?.id || null,
    userName: user?.username || user?.name || null,
    userRole: user?.role || null,
    action,
    details: details || null,
    ipAddress: req.ip || req.headers['x-forwarded-for']?.toString() || null,
  }).catch(() => {});
}

function stripPasswordsFromList(users: any[]) {
  return users.map(stripPassword);
}

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const recordingsDir = path.join(uploadDir, "recordings");
if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });

const recordingUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, recordingsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".webm";
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files (JPEG, PNG, GIF, WebP) are allowed"));
    }
  },
});

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  setupAuth(app);
  const sessionWss = setupSessionWebSocket(httpServer);
  const classWss = setupClassWebSocket(httpServer);

  // Unified WebSocket upgrade router — prevents 400 conflicts between multiple WS servers
  httpServer.on("upgrade", (req, socket, head) => {
    const url = req.url?.split("?")[0];
    if (url === "/ws/session") {
      sessionWss.handleUpgrade(req, socket as any, head, (ws) => {
        sessionWss.emit("connection", ws, req);
      });
    } else if (url === "/ws/class") {
      classWss.handleUpgrade(req, socket as any, head, (ws) => {
        classWss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  // === AUTH ===
  // Handled in setupAuth

  // === USERS ===
  app.patch(api.users.update.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const targetId = parseInt(req.params.id);
    const isAdmin = req.user!.role === "admin";
    const isSelf = req.user!.id === targetId;
    if (!isAdmin && !isSelf) return res.status(403).json({ error: "Forbidden" });
    const updates = api.users.update.input.parse(req.body);
    if (!isAdmin && updates.role) return res.status(403).json({ error: "Forbidden" });
    const user = await storage.updateUser(targetId, updates);
    if (updates.role) {
      logActivity(req, "change_role", `Changed user ${user.username} role to ${updates.role}`);
    }
    res.json(stripPassword(user));
  });

  app.get(api.users.listTutors.path, async (req, res) => {
    const tutors = await storage.listTutors();
    res.json(stripPasswordsFromList(tutors));
  });

  app.post(api.users.approveTutor.path, async (req, res) => {
    if (!req.isAuthenticated() || req.user!.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    const user = await storage.updateUser(parseInt(req.params.id), { isTutorApproved: true });
    logActivity(req, "approve_tutor", `Admin approved tutor: ${user.username} (ID: ${user.id})`);
    res.json(stripPassword(user));
  });

  app.get("/api/admin/users", async (req, res) => {
    if (!req.isAuthenticated() || req.user!.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    const users = await storage.getAllUsers();
    res.json(stripPasswordsFromList(users));
  });

  // === PROFILE AVATAR UPLOAD ===
  const avatarDir = path.join(process.cwd(), "uploads", "avatars");
  if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

  const avatarUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, avatarDir),
      filename: (_req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Only image files (JPEG, PNG, GIF, WebP) are allowed"));
      }
    },
  });

  app.post("/api/profile/avatar", (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    next();
  }, avatarUpload.single("avatar"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const url = `/uploads/avatars/${req.file.filename}`;
    await storage.updateUser(req.user!.id, { avatar: url });
    const updated = await storage.getUser(req.user!.id);
    res.json({ url, user: stripPassword(updated) });
  });

  // === TEXTBOOKS ===
  app.get(api.textbooks.list.path, async (req, res) => {
    const grade = req.query.grade ? parseInt(req.query.grade as string) : undefined;
    const books = await storage.getTextbooks(grade);
    res.json(books);
  });

  app.get(api.textbooks.get.path, async (req, res) => {
    const book = await storage.getTextbook(parseInt(req.params.id));
    if (!book) return res.status(404).json({ error: "Not found" });
    res.json(book);
  });

  app.post(api.textbooks.create.path, async (req, res) => {
    if (!req.isAuthenticated() || req.user!.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    const input = api.textbooks.create.input.parse(req.body);
    const book = await storage.createTextbook(input);
    res.status(201).json(book);
  });

  // === ANNOTATIONS ===
  app.get(api.annotations.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const textbookId = req.query.textbookId ? parseInt(req.query.textbookId as string) : undefined;
    const sharedByRaw = req.query.sharedBy ? parseInt(req.query.sharedBy as string) : undefined;
    let userId = req.user!.id;
    if (sharedByRaw && !isNaN(sharedByRaw) && sharedByRaw !== req.user!.id) {
      const sharedSession = await storage.findDirectSession(req.user!.id, sharedByRaw);
      if (!sharedSession) {
        return res.status(403).json({ message: "Not authorized to view these annotations" });
      }
      userId = sharedByRaw;
    }
    const notes = await storage.getAnnotations(userId, textbookId);
    res.json(notes);
  });

  app.post(api.annotations.create.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    try {
      const input = api.annotations.create.input.parse(req.body);
      const note = await storage.createAnnotation({ ...input, userId: req.user!.id });
      res.status(201).json(note);
    } catch (err: any) {
      console.error("Annotation create error:", err.message);
      res.status(400).json({ message: err.message });
    }
  });

  app.delete(api.annotations.delete.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    // Add check for ownership
    await storage.deleteAnnotation(parseInt(req.params.id));
    res.sendStatus(204);
  });

  // === HELP REQUESTS ===
  app.post(api.helpRequests.create.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const input = api.helpRequests.create.input.parse(req.body);
    const request = await storage.createHelpRequest({ ...input, learnerId: req.user!.id });
    logActivity(req, "help_request", `Help request created: "${input.subject}"`);
    res.status(201).json(request);
  });

  app.get(api.helpRequests.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const requests = await storage.getHelpRequests();
    res.json(requests);
  });

  app.patch(api.helpRequests.update.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const updates = api.helpRequests.update.input.parse(req.body);
    const request = await storage.updateHelpRequest(parseInt(req.params.id), updates);
    res.json(request);
  });


  app.get(api.atp.getTest.path, async (req, res) => {
    const test = await storage.getDiagnosticTest(parseInt(req.params.topicId));
    if (!test) return res.status(404).json({ error: "Not found" });
    res.json(test);
  });

  app.post(api.atp.submitTest.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const { answers, score } = api.atp.submitTest.input.parse(req.body);
    const testId = parseInt(req.params.testId);
    const result = await storage.submitTestResult({
      userId: req.user!.id,
      testId,
      score,
      answers,
    });
    res.status(201).json(result);
  });

  // === TUTOR SESSIONS ===
  app.post(api.tutorSessions.create.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    try {
      const body = { ...req.body };
      if (typeof body.startTime === "string") body.startTime = new Date(body.startTime);
      if (typeof body.endTime === "string") body.endTime = new Date(body.endTime);
      if (body.topic === undefined) body.topic = null;
      if (body.meetingLink === undefined) body.meetingLink = null;
      if (body.status === undefined) body.status = "requested";
      const input = api.tutorSessions.create.input.parse(body);
      const session = await storage.createTutorSession({ ...input, learnerId: req.user!.id });
      logActivity(req, "book_session", `Tutor session booked with tutor ID: ${input.tutorId}`);
      res.status(201).json(session);
    } catch (err: any) {
      console.error("[TutorSession] Create failed:", err);
      res.status(400).json({ message: err.message || "Failed to create session" });
    }
  });

  app.get(api.tutorSessions.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const role = req.user!.role === "tutor" ? "tutor" : "learner";
    const sessions = await storage.getTutorSessions(req.user!.id, role);
    res.json(sessions);
  });

  app.get("/api/tutor-sessions/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const session = await storage.getTutorSession(parseInt(req.params.id));
    if (!session) return res.status(404).json({ error: "Not found" });
    if (session.learnerId !== req.user!.id && session.tutorId !== req.user!.id && req.user!.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.json(session);
  });

  app.patch(api.tutorSessions.update.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const updates = api.tutorSessions.update.input.parse(req.body);
    const session = await storage.updateTutorSession(parseInt(req.params.id), updates);
    res.json(session);
  });

  // === SESSION RECORDINGS ===
  app.post("/api/tutor-sessions/:id/recording", recordingUpload.single("recording"), async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const sessionId = parseInt(req.params.id);
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const filePath = `/uploads/recordings/${req.file.filename}`;
    const recording = await storage.createSessionRecording({
      sessionId,
      userId: req.user!.id,
      filePath,
      durationSeconds: req.body.durationSeconds ? parseInt(req.body.durationSeconds) : null,
      fileSizeBytes: req.file.size,
      mimeType: req.file.mimetype || "video/webm",
    });
    res.json(recording);
  });

  app.get("/api/tutor-sessions/:id/recordings", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const recordings = await storage.getSessionRecordings(parseInt(req.params.id));
    res.json(recordings);
  });

  app.get("/api/my-recordings", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const recordings = await storage.getUserRecordings(req.user!.id);
    res.json(recordings);
  });

  app.delete("/api/session-recordings/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const id = parseInt(req.params.id);
    const allUserRecs = await storage.getUserRecordings(req.user!.id);
    const rec = allUserRecs.find(r => r.id === id);
    if (!rec) return res.status(404).json({ error: "Recording not found" });
    const absPath = path.join(process.cwd(), rec.filePath.replace(/^\//, ""));
    if (fs.existsSync(absPath)) { try { fs.unlinkSync(absPath); } catch {} }
    await storage.deleteSessionRecording(id, req.user!.id);
    res.json({ ok: true });
  });

  // === CHAT ===
  app.use("/uploads", express.static(uploadDir));

  app.get("/api/chat/sessions", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const sessions = await storage.getUserChatSessions(req.user!.id);
    const safeSessions = sessions.map((s: any) => ({
      ...s,
      participants: s.participants ? stripPasswordsFromList(s.participants) : s.participants,
    }));
    res.json(safeSessions);
  });

  app.post("/api/chat/sessions", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const { targetUserId, initialMessage } = req.body;
    if (!targetUserId) return res.status(400).json({ message: "targetUserId is required" });

    let session = await storage.findDirectSession(req.user!.id, targetUserId);
    if (!session) {
      session = await storage.createChatSession({ type: "direct" });
      await storage.addSessionParticipant(session.id, req.user!.id);
      await storage.addSessionParticipant(session.id, targetUserId);
    }

    if (initialMessage) {
      await storage.createChatMessage({
        sessionId: session.id,
        senderId: req.user!.id,
        content: initialMessage,
        type: "text",
        mediaUrl: null,
      });
    }

    const fullSession = await storage.getUserChatSessions(req.user!.id);
    const thisSession = fullSession.find(s => s.id === session!.id);
    const result = thisSession || session;
    if (result && (result as any).participants) {
      (result as any).participants = stripPasswordsFromList((result as any).participants);
    }
    res.status(201).json(result);
  });

  app.get("/api/chat/unread", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const counts = await storage.getUnreadCounts(req.user!.id);
    res.json(counts);
  });

  app.post("/api/chat/sessions/:id/read", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const sessionId = parseInt(req.params.id);
    const { lastMessageId } = req.body;
    if (typeof lastMessageId !== "number") return res.status(400).json({ message: "lastMessageId required" });
    await storage.markSessionRead(sessionId, req.user!.id, lastMessageId);
    res.sendStatus(200);
  });

  app.get("/api/chat/sessions/:id/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const sessionId = parseInt(req.params.id);
    const afterId = req.query.after ? parseInt(req.query.after as string) : undefined;
    const messages = await storage.getChatMessages(sessionId, afterId);
    res.json(messages);
  });

  app.post("/api/chat/sessions/:id/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const sessionId = parseInt(req.params.id);
    const { content, type, mediaUrl } = req.body;
    const message = await storage.createChatMessage({
      sessionId,
      senderId: req.user!.id,
      content: content || null,
      type: type || "text",
      mediaUrl: mediaUrl || null,
    });
    res.status(201).json(message);
  });

  app.get("/api/chat/sessions/:id/whiteboard", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const session = await storage.getChatSession(parseInt(req.params.id));
    if (!session) return res.status(404).json({ error: "Not found" });
    res.json({ whiteboardData: session.whiteboardData });
  });

  app.put("/api/chat/sessions/:id/whiteboard", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const session = await storage.updateWhiteboardData(parseInt(req.params.id), req.body.whiteboardData);
    res.json(session);
  });

  app.post("/api/chat/upload", (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    next();
  }, upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const allowedMimes = [
      "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/bmp",
      "video/webm", "video/mp4", "video/quicktime",
      "audio/webm", "audio/mpeg", "audio/ogg", "audio/wav", "audio/mp4",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain", "text/csv",
      "application/zip", "application/x-rar-compressed",
    ];
    if (!allowedMimes.includes(req.file.mimetype)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: "File type not allowed" });
    }
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  });

  app.get("/api/chat/users/search", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const q = (req.query.q as string) || "";
    if (q.length < 1) return res.json([]);
    const results = await storage.searchUsers(q, req.user!.id);
    res.json(results.map(u => ({ id: u.id, username: u.username, name: u.name, surname: u.surname, avatar: u.avatar, role: u.role, grade: u.grade })));
  });

  // === AI ===
  const mathSystemPrompt = `You are an expert South African mathematics tutor for Grades 1-12 CAPS curriculum.

CRITICAL FORMATTING RULES — YOU MUST FOLLOW EXACTLY OR THE OUTPUT WILL BREAK:
- Use Markdown for structure (## headings, **bold**, numbered lists)
- For ALL math, use ONLY dollar-sign delimiters:
  - Inline: $x = 5$ (single dollar signs)
  - Display block: on its own line, use $$equation$$
- ABSOLUTELY FORBIDDEN (these will NOT render and will show as ugly raw text):
  - NEVER use \\begin{align*}, \\end{align*}, \\begin{aligned}, \\end{aligned}, \\begin{equation}, \\end{equation} or ANY LaTeX environment
  - NEVER use \\[...\\] or \\(...\\) delimiters
  - NEVER put \\frac, \\boxed, \\sqrt, \\mathbb, or ANY LaTeX command outside of $...$ or $$...$$ delimiters
  - NEVER use \\\\ for line breaks inside math — instead, end the $$ block and start a new one
- For multi-step work, use SEPARATE display equations, one per line:
  CORRECT:
  $$2x + 3 = 7$$
  $$2x = 4$$
  $$x = 2$$
  WRONG: $$2x + 3 = 7 \\\\ 2x = 4 \\\\ x = 2$$
- Every fraction: $\\frac{a}{b}$, every exponent: $x^2$, every root: $\\sqrt{x}$
- Boxed final answer: $$\\boxed{x = 10}$$

GRAPHING RULES:
- NEVER draw ASCII art. Use a code block with language tag "graph" and JSON inside.
- The JSON has "functions" array, each with "fn" (math expr using x), "label", optional "color".
- Also supports "xDomain", "yDomain" (as [min,max]), "title".
- Use function-plot syntax: "x^2", "sqrt(x)", "sin(x)", "cos(x)", "log(x)", "abs(x)"
- Example:
\`\`\`graph
{"functions": [{"fn": "x^2", "label": "y = x²"}], "xDomain": [-5, 5], "yDomain": [-2, 10], "title": "Graph of y = x²"}
\`\`\`

TEACHING STYLE:
- Show step-by-step working with numbered steps
- Explain WHY each step is done
- Be encouraging and patient
- End with a boxed final answer using $$\\boxed{...}$$
- When graphing is needed, include a graph code block
- Do NOT offer follow-up questions — the learner has a dedicated follow-up input

TOPICS: Algebra, Geometry, Trigonometry, Calculus, Statistics, Financial Maths, Number Patterns.`;

  app.post(api.ai.quickQuestion.path, imageUpload.single("image"), async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    try {
      const question = (req.body?.question || "").trim();
      const grade = req.body?.grade;
      let history: any[] = [];

      if (req.body?.history) {
        try {
          history = typeof req.body.history === "string" ? JSON.parse(req.body.history) : req.body.history;
          if (!Array.isArray(history)) history = [];
        } catch { history = []; }
      }

      if (!question && !req.file && history.length === 0) {
        return res.status(400).json({ message: "Please provide a question or upload an image." });
      }

      const { openai } = await import("./replit_integrations/image/client");

      const messages: any[] = [
        { role: "system", content: mathSystemPrompt },
      ];

      if (history.length > 0) {
        const safeHistory = history.slice(-10).map((m: any) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content || ""),
        }));
        messages.push(...safeHistory);
      } else if (req.file) {
        const imageBuffer = fs.readFileSync(req.file.path);
        const base64Image = imageBuffer.toString("base64");
        const mimeType = req.file.mimetype || "image/png";
        messages.push({
          role: "user",
          content: [
            { type: "text", text: `Grade: ${grade || "General"}\n${question || "Please solve this problem from the image. Show all working and explain each step."}` },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
          ],
        });
        try { fs.unlinkSync(req.file.path); } catch {}
      } else {
        messages.push({
          role: "user",
          content: `Grade: ${grade || "General"}\nQuestion: ${question}`,
        });
      }

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages,
        max_tokens: 4096,
      });

      res.json({ answer: completion.choices[0].message.content || "Sorry, I couldn't answer that." });
    } catch (err) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch {} }
      console.error("AI Error:", err);
      res.status(500).json({ message: "Failed to get AI response" });
    }
  });


  // === ATP (LEARNING PATH) ===
  app.get("/api/atp", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const grade = req.query.grade ? parseInt(req.query.grade as string) : undefined;
    const term = req.query.term ? parseInt(req.query.term as string) : undefined;
    const subject = req.query.subject as string | undefined;
    const topics = await storage.getATPTopics(grade, term, subject);
    res.json(topics);
  });

  app.get("/api/atp/subjects", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const grade = req.query.grade ? parseInt(req.query.grade as string) : undefined;
    const subjects = await storage.getATPSubjects(grade);
    res.json(subjects);
  });

  app.get("/api/atp/tests/:topicId", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const topicId = parseInt(req.params.topicId);
    const test = await storage.getDiagnosticTest(topicId);
    if (!test) return res.status(404).json({ message: "No test found for this topic" });
    res.json(test);
  });

  app.post("/api/atp/tests/:testId/submit", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const testId = parseInt(req.params.testId);
    const { answers, score } = req.body;
    const result = await storage.submitTestResult({
      testId,
      userId: req.user!.id,
      answers,
      score,
    });
    res.status(201).json(result);
  });

  // === QUIZZES (AI-generated) ===
  app.post("/api/quiz/generate", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { topicId } = req.body;
      const topic = (await storage.getATPTopics())?.find(t => t.id === topicId);
      if (!topic) return res.status(404).json({ message: "Topic not found" });

      const { openai } = await import("./replit_integrations/image/client");
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: `You are a South African CAPS curriculum quiz generator. Generate exactly 5 multiple-choice questions for the given topic. Each question must test understanding of the topic content.

Return ONLY a valid JSON array with this exact structure (no markdown, no code blocks):
[{"question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correctAnswer": 0, "explanation": "..."}]

Rules:
- correctAnswer is the 0-based index of the correct option
- Each question should test a different aspect of the topic
- Include calculations where appropriate
- Use LaTeX notation for ALL mathematical expressions. Use $...$ for inline math and $$...$$ for display math.
- Examples: $x^2 + 3x - 5$, $\\frac{a}{b}$, $\\sum_{k=1}^{n} k$, $\\sqrt{x}$, $\\int_0^1 f(x)\\,dx$
- For sigma notation use $\\sum_{k=1}^{10} (3k-2)$ not plain text like Σ_{k=1}^10 (3k-2)
- For fractions use $\\frac{3}{4}$ not 3/4
- For exponents use $x^2$ not x^2
- For subscripts use $a_n$ not a_n
- Explanations should be clear, educational, and also use LaTeX for any math
- Questions should be appropriate for Grade ${topic.grade} level` },
          { role: "user", content: `Subject: ${topic.subject}\nGrade: ${topic.grade}\nTopic: ${topic.topic}\n\nContent:\n${topic.content || "Generate questions based on the topic name."}` }
        ],
        max_tokens: 3000,
      });

      let questionsText = completion.choices[0].message.content || "[]";
      questionsText = questionsText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      let questions;
      try {
        questions = JSON.parse(questionsText);
      } catch (parseErr) {
        console.error("Quiz JSON parse error, raw text:", questionsText);
        const arrayMatch = questionsText.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          questions = JSON.parse(arrayMatch[0]);
        } else {
          throw new Error("Failed to parse quiz questions from AI response");
        }
      }

      const { nanoid } = await import("nanoid");
      const shareToken = nanoid(12);

      const quiz = await storage.createQuizSession({
        userId: req.user!.id,
        topicId,
        questions,
        answers: null,
        score: null,
        percentage: null,
        feedback: null,
        shareToken,
      });

      logActivity(req, "generate_quiz", `Quiz generated for topic: ${topic.topic} (Grade ${topic.grade})`);
      res.json(quiz);
    } catch (err) {
      console.error("Quiz generation error:", err);
      res.status(500).json({ message: "Failed to generate quiz" });
    }
  });

  app.post("/api/quiz/:id/submit", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    try {
      const quizId = parseInt(req.params.id);
      const { answers } = req.body;
      const quiz = await storage.getQuizSession(quizId);
      if (!quiz) return res.status(404).json({ message: "Quiz not found" });

      const questions = quiz.questions as any[];
      let correct = 0;
      const results = questions.map((q: any, i: number) => {
        const isCorrect = answers[i] === q.correctAnswer;
        if (isCorrect) correct++;
        return { questionIndex: i, selected: answers[i], correct: q.correctAnswer, isCorrect, explanation: q.explanation };
      });

      const score = correct;
      const percentage = Math.round((correct / questions.length) * 100);
      let feedback = "";
      if (percentage >= 80) feedback = "Excellent work! You have a strong understanding of this topic.";
      else if (percentage >= 60) feedback = "Good effort! Review the questions you got wrong to strengthen your understanding.";
      else if (percentage >= 40) feedback = "You're getting there! Revisit the topic content and try again.";
      else feedback = "Keep practising! Go through the topic material carefully and attempt the quiz again.";

      const updated = await storage.submitQuiz(quizId, results, score, percentage, feedback);
      logActivity(req, "submit_quiz", `Quiz submitted: ${percentage}% (${score}/${quiz.questions.length})`);
      res.json(updated);
    } catch (err) {
      console.error("Quiz submit error:", err);
      res.status(500).json({ message: "Failed to submit quiz" });
    }
  });

  app.get("/api/quiz/history", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const topicId = req.query.topicId ? parseInt(req.query.topicId as string) : undefined;
    const history = await storage.getUserQuizHistory(req.user!.id, topicId);
    res.json(history);
  });

  app.get("/api/quiz/share/:token", async (req, res) => {
    const quiz = await storage.getQuizSessionByToken(req.params.token);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    const isCompleted = quiz.answers !== null;
    const questions = isCompleted
      ? quiz.questions
      : (quiz.questions as any[]).map((q: any) => ({
          question: q.question,
          options: q.options,
        }));
    res.json({
      questions,
      answers: quiz.answers,
      score: quiz.score,
      percentage: quiz.percentage,
      feedback: quiz.feedback,
      shareToken: quiz.shareToken,
      isCompleted,
    });
  });

  // === ANNOUNCEMENTS ===
  app.get("/api/announcements", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const user = req.user!;
    if (user.role === "admin") {
      const all = await storage.getAnnouncements();
      res.json(all);
    } else {
      const filtered = await storage.getAnnouncements(user.role, user.grade || undefined);
      res.json(filtered);
    }
  });

  app.post("/api/announcements", async (req, res) => {
    if (!req.isAuthenticated() || req.user!.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    const { title, content, targetRoles, targetGrades } = req.body;
    if (!title || !content || !targetRoles) return res.status(400).json({ message: "Title, content, and target roles are required" });
    const announcement = await storage.createAnnouncement({
      title,
      content,
      createdBy: req.user!.id,
      targetRoles,
      targetGrades: targetGrades || null,
    });
    logActivity(req, "create_announcement", `Announcement created: "${title}"`);
    res.status(201).json(announcement);
  });

  app.delete("/api/announcements/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user!.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    await storage.deleteAnnouncement(parseInt(req.params.id));
    logActivity(req, "delete_announcement", `Announcement deleted (ID: ${req.params.id})`);
    res.sendStatus(204);
  });

  // === ACTIVITY LOGS (Admin) ===
  app.get("/api/admin/activity-logs", async (req, res) => {
    if (!req.isAuthenticated() || req.user!.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    const result = await storage.getActivityLogs(limit, offset);
    res.json(result);
  });

  // === TUTOR RATES ===
  app.get("/api/tutor-rates/:tutorId", async (req, res) => {
    const tutorId = parseInt(req.params.tutorId);
    const rate = await storage.getTutorRate(tutorId);
    res.json(rate || { tutorId, hourlyRate: 15000, currency: "ZAR" });
  });

  app.post("/api/tutor-rates", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (req.user!.role !== "tutor" && req.user!.role !== "admin") return res.sendStatus(403);
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    if (req.user!.role !== "tutor" && req.user!.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    const { hourlyRate, tutorId } = req.body;
    if (hourlyRate === undefined || hourlyRate === null || hourlyRate < 0) return res.status(400).json({ message: "Invalid rate" });
    let targetTutorId = req.user!.id;
    if (req.user!.role === "admin" && tutorId) {
      const targetUser = await storage.getUser(tutorId);
      if (!targetUser || targetUser.role !== "tutor") {
        return res.status(400).json({ message: "Target user is not a tutor" });
      }
      targetTutorId = tutorId;
    }
    const rate = await storage.setTutorRate(targetTutorId, hourlyRate);
    res.json(rate);
  });

  // === TUTOR AVAILABILITY ===
  app.get("/api/tutor-availability/:tutorId", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const tutorId = parseInt(req.params.tutorId);
    const slots = await storage.getTutorAvailability(tutorId);
    res.json(slots);
  });

  app.post("/api/tutor-availability", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (req.user!.role !== "tutor") return res.sendStatus(403);
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    if (req.user!.role !== "tutor") return res.status(403).json({ error: "Forbidden" });
    const { slots } = req.body;
    if (!Array.isArray(slots)) return res.status(400).json({ message: "Slots must be an array" });
    const validSlots = slots.map((s: any) => ({
      tutorId: req.user!.id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      isRecurring: s.isRecurring ?? true,
      specificDate: s.specificDate || null,
    }));
    const result = await storage.setTutorAvailability(req.user!.id, validSlots);
    res.json(result);
  });

  // === WHITEBOARD UPLOADS ===
  app.post("/api/whiteboard/upload", upload.single("file"), async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl, filename: req.file.originalname });
  });

  app.use("/uploads", express.static(uploadDir));

  // === TUTOR BANK DETAILS ===
  app.get("/api/tutor-bank-details", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (req.user!.role !== "tutor") return res.sendStatus(403);
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    if (req.user!.role !== "tutor") return res.status(403).json({ error: "Forbidden" });
    const details = await storage.getTutorBankDetails(req.user!.id);
    res.json(details || null);
  });

  app.post("/api/tutor-bank-details", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (req.user!.role !== "tutor") return res.sendStatus(403);
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    if (req.user!.role !== "tutor") return res.status(403).json({ error: "Forbidden" });
    const { bankName, accountHolder, accountNumber, branchCode, accountType } = req.body;
    if (!bankName || !accountHolder || !accountNumber || !branchCode) {
      return res.status(400).json({ message: "All bank details are required" });
    }
    const details = await storage.saveTutorBankDetails({
      tutorId: req.user!.id,
      bankName,
      accountHolder,
      accountNumber,
      branchCode,
      accountType: accountType || "cheque",
    });
    res.json(details);
  });

  // === PAYMENT METHODS ===
  app.get("/api/payment-methods", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const methods = await storage.getPaymentMethods(req.user!.id);
    res.json(methods);
  });

  app.post("/api/payment-methods", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const { cardNumber, expiryMonth, expiryYear, cardholderName } = req.body;
    if (!cardNumber || !expiryMonth || !expiryYear) return res.status(400).json({ message: "Missing card details" });

    const cardLast4 = cardNumber.replace(/\s/g, "").slice(-4);
    const firstDigit = cardNumber.replace(/\s/g, "")[0];
    let cardBrand = "Unknown";
    if (firstDigit === "4") cardBrand = "Visa";
    else if (firstDigit === "5") cardBrand = "Mastercard";
    else if (firstDigit === "3") cardBrand = "Amex";

    const existing = await storage.getPaymentMethods(req.user!.id);
    const method = await storage.addPaymentMethod({
      userId: req.user!.id,
      cardLast4,
      cardBrand,
      expiryMonth: parseInt(expiryMonth),
      expiryYear: parseInt(expiryYear),
      isDefault: existing.length === 0,
    });
    res.status(201).json(method);
  });

  app.delete("/api/payment-methods/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    await storage.deletePaymentMethod(parseInt(req.params.id), req.user!.id);
    res.sendStatus(204);
  });

  app.post("/api/payment-methods/:id/default", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    await storage.setDefaultPaymentMethod(parseInt(req.params.id), req.user!.id);
    res.json({ ok: true });
  });

  // === PAYMENTS ===
  app.post("/api/payments/authorize", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const { sessionId, paymentMethodId } = req.body;
    if (!sessionId) return res.status(400).json({ message: "Session ID required" });

    const existing = await storage.getPaymentBySession(sessionId);
    if (existing) return res.status(400).json({ message: "Payment already exists for this session" });

    const tutorSession = await storage.getTutorSessions(req.user!.id, "learner")
      .then(sessions => sessions.find(s => s.id === sessionId));
    if (!tutorSession) return res.status(404).json({ message: "Session not found" });

    const rate = await storage.getTutorRate(tutorSession.tutorId);
    const hourlyRate = rate?.hourlyRate ?? 15000;

    const startTime = new Date(tutorSession.startTime);
    const endTime = new Date(tutorSession.endTime);
    const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

    const sessionCost = Math.round((hourlyRate / 60) * durationMinutes);
    const platformFee = Math.round(sessionCost * 0.15);
    const totalAmount = sessionCost + platformFee;
    const tutorEarnings = sessionCost;

    const payment = await storage.createPayment({
      sessionId,
      learnerId: req.user!.id,
      tutorId: tutorSession.tutorId,
      paymentMethodId: paymentMethodId || null,
      amount: totalAmount,
      platformFee,
      tutorEarnings,
      currency: "ZAR",
      status: "authorized",
      durationMinutes,
      hourlyRate,
    });

    res.status(201).json(payment);
  });

  app.post("/api/payments/:id/capture", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const paymentId = parseInt(req.params.id);
    const payment = await storage.getPayment(paymentId);
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    if (payment.status !== "authorized") return res.status(400).json({ message: "Payment cannot be captured" });

    const userId = req.user!.id;
    const userRole = req.user!.role;
    if (userRole !== "admin" && payment.learnerId !== userId && payment.tutorId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { actualDurationMinutes } = req.body;
    const rawDuration = typeof actualDurationMinutes === "number" && actualDurationMinutes > 0
      ? Math.min(Math.round(actualDurationMinutes), 1440)
      : null;
    const duration = rawDuration || payment.durationMinutes;

    const sessionCost = Math.round((payment.hourlyRate / 60) * duration);
    const platformFee = Math.round(sessionCost * 0.15);
    const totalAmount = sessionCost + platformFee;
    const tutorEarnings = sessionCost;

    const captured = await storage.capturePayment(paymentId, totalAmount, platformFee, tutorEarnings, duration);

    await storage.updateTutorSession(payment.sessionId, {
      status: "completed",
      actualDurationMinutes: duration,
    } as any);

    res.json(captured);
  });

  app.post("/api/payments/:id/cancel", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const paymentId = parseInt(req.params.id);
    const payment = await storage.getPayment(paymentId);
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    if (payment.status !== "authorized") return res.status(400).json({ message: "Payment cannot be cancelled" });

    const userId = req.user!.id;
    const userRole = req.user!.role;
    if (userRole !== "admin" && payment.learnerId !== userId && payment.tutorId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const cancelled = await storage.cancelPayment(paymentId);
    res.json(cancelled);
  });

  app.post("/api/payments/:id/refund", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const paymentId = parseInt(req.params.id);
    const payment = await storage.getPayment(paymentId);
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    if (payment.status !== "captured") return res.status(400).json({ message: "Only captured payments can be refunded" });

    const userId = req.user!.id;
    const userRole = req.user!.role;
    if (userRole !== "admin" && payment.learnerId !== userId && payment.tutorId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const refunded = await storage.refundPayment(paymentId);
    res.json(refunded);
  });

  app.get("/api/payments", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const role = req.user!.role as "learner" | "tutor";
    const paymentsList = await storage.getPaymentsForUser(req.user!.id, role);
    res.json(paymentsList);
  });

  app.get("/api/payments/session/:sessionId", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const payment = await storage.getPaymentBySession(parseInt(req.params.sessionId));
    if (payment) {
      const userId = req.user!.id;
      const userRole = req.user!.role;
      if (userRole !== "admin" && payment.learnerId !== userId && payment.tutorId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }
    res.json(payment || null);
  });

  app.get("/api/tutor-earnings", async (req, res) => {
    if (!req.isAuthenticated() || req.user!.role !== "tutor") return res.status(403).json({ error: "Forbidden" });
    const earnings = await storage.getTutorEarnings(req.user!.id);
    res.json(earnings);
  });


  // === LIVE CLASSES ===
  app.get("/api/live-classes", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const status = (req.query.status as string) === "ended" ? "ended" : "live";
    const classes = await storage.getLiveClasses(status);
    res.json(classes);
  });

  app.get("/api/live-classes/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const cls = await storage.getLiveClass(parseInt(req.params.id));
    if (!cls) return res.status(404).json({ error: "Not found" });
    res.json(cls);
  });

  app.post("/api/live-classes", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    if (req.user!.role !== "tutor") return res.status(403).json({ error: "Tutors only" });
    const { title, subject, description, grade } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "Title required" });
    const cls = await storage.createLiveClass({
      tutorId: req.user!.id,
      title: title.trim(),
      subject: subject || null,
      description: description?.trim() || null,
      grade: grade && grade !== "all" ? parseInt(grade) : null,
      status: "live",
    });
    logActivity(req, "live_class_started", `Class: ${title}`);
    res.status(201).json(cls);
  });

  app.post("/api/live-classes/:id/end", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const cls = await storage.getLiveClass(parseInt(req.params.id));
    if (!cls) return res.status(404).json({ error: "Not found" });
    if (cls.tutorId !== req.user!.id && req.user!.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    const ended = await storage.endLiveClass(cls.id);
    logActivity(req, "live_class_ended", `Class: ${cls.title}`);
    res.json(ended);
  });

  app.get("/api/share-config", async (_req, res) => {
    const domain = await storage.getPlatformSetting("customDomain");
    res.json({ customDomain: domain || null });
  });

  // === PLATFORM SETTINGS (Admin only) ===
  app.get("/api/platform-settings", async (req, res) => {
    if (!req.isAuthenticated() || req.user!.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    const settings = await storage.getAllPlatformSettings();
    res.json(settings);
  });

  app.post("/api/platform-settings", async (req, res) => {
    if (!req.isAuthenticated() || req.user!.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    const { settings } = req.body;
    if (!settings || typeof settings !== "object") return res.status(400).json({ message: "Invalid settings" });
    for (const [key, value] of Object.entries(settings)) {
      if (typeof value === "string") {
        await storage.setPlatformSetting(key, value);
      }
    }
    res.json({ success: true });
  });

  setInterval(async () => {
    try {
      const count = await storage.completeExpiredSessions();
      if (count > 0) {
        console.log(`[Scheduler] Auto-completed ${count} expired session(s) with payment capture`);
      }

      const orphaned = await storage.captureOrphanedPayments();
      if (orphaned > 0) {
        console.log(`[Scheduler] Captured ${orphaned} orphaned authorized payment(s)`);
      }
    } catch (err) {
      console.error("[Scheduler] Error completing expired sessions:", err);
    }
  }, 30000);

  return httpServer;
}
