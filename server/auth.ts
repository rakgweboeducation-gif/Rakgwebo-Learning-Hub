import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User } from "@shared/schema";
import nodemailer from "nodemailer";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "r4kgw3b0_s3cr3t",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          console.log(`[Auth] Login failed: user '${username}' not found`);
          return done(null, false);
        }
        const passwordMatch = await comparePasswords(password, user.password);
        if (!passwordMatch) {
          console.log(`[Auth] Login failed: wrong password for user '${username}'`);
          return done(null, false);
        }
        console.log(`[Auth] Login successful for user '${username}' (role: ${user.role})`);
        return done(null, user);
      } catch (err) {
        console.error(`[Auth] Login error:`, err);
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, (user as User).id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).send("Username already exists");
        return res.status(400).json({ error: "Username already exists" });
      }

      const hashedPassword = await hashPassword(req.body.password);
      const user = await storage.createUser({
        ...req.body,
        password: hashedPassword,
      });

      req.login(user, (err) => {
        if (err) return next(err);
        const { password: _, ...safeUser } = user as any;
        storage.logActivity({
          userId: user.id,
          userName: user.username,
          userRole: user.role,
          action: "register",
          details: `New ${user.role} account created: ${user.username}`,
          ipAddress: req.ip || null,
        }).catch(() => {});
        res.status(201).json(safeUser);
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    const { password, ...safeUser } = req.user as any;
    storage.logActivity({
      userId: safeUser.id,
      userName: safeUser.username,
      userRole: safeUser.role,
      action: "login",
      details: `User logged in: ${safeUser.username}`,
      ipAddress: req.ip || null,
    }).catch(() => {});
    res.status(200).json(safeUser);
  });

  app.post("/api/logout", (req, res, next) => {
    const user = req.user as any;
    if (user) {
      storage.logActivity({
        userId: user.id,
        userName: user.username,
        userRole: user.role,
        action: "logout",
        details: `User logged out: ${user.username}`,
        ipAddress: req.ip || null,
      }).catch(() => {});
    }
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const { password, ...safeUser } = req.user as any;
    res.json(safeUser);
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.json({ message: "If an account with that email exists, a reset link has been sent." });
      }

      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await storage.createPasswordResetToken(user.id, token, expiresAt);

      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = parseInt(process.env.SMTP_PORT || "587");
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const fromEmail = process.env.SMTP_FROM || smtpUser;

      if (!smtpHost || !smtpUser || !smtpPass) {
        console.error("SMTP settings not configured. Cannot send password reset email.");
        return res.status(500).json({ message: "Email service is not configured. Please contact the administrator." });
      }

      console.log("[PasswordReset] SMTP config - host:", smtpHost, "port:", smtpPort, "user:", smtpUser, "from:", fromEmail);

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      try {
        await transporter.verify();
        console.log("[PasswordReset] SMTP connection verified successfully");
      } catch (verifyErr) {
        console.error("[PasswordReset] SMTP verification failed:", verifyErr);
        return res.status(500).json({ message: "Email service connection failed. Please contact the administrator." });
      }

      const protocol = req.get("x-forwarded-proto") || req.protocol || "https";
      const host = req.get("host") || "localhost:5000";
      const resetUrl = `${protocol}://${host}/reset-password?token=${token}`;
      console.log("[PasswordReset] Reset URL:", resetUrl);

      const mailResult = await transporter.sendMail({
        from: `"Rakgwebo Learning Hub" <${fromEmail}>`,
        to: email,
        subject: "Password Reset - Rakgwebo Learning Hub",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1e293b;">Password Reset Request</h2>
            <p>Hi ${user.name || user.username},</p>
            <p>We received a request to reset your password. Click the button below to set a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Reset Password
              </a>
            </div>
            <p style="color: #64748b; font-size: 14px;">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="color: #94a3b8; font-size: 12px;">Rakgwebo Learning Hub</p>
          </div>
        `,
      });
      console.log("[PasswordReset] Email sent successfully, messageId:", mailResult.messageId);

      res.json({ message: "If an account with that email exists, a reset link has been sent." });
    } catch (err) {
      console.error("Forgot password error:", err);
      res.status(500).json({ message: "Failed to process request" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) return res.status(400).json({ message: "Token and password are required" });
      if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

      const resetToken = await storage.getPasswordResetToken(token);
      if (!resetToken) return res.status(400).json({ message: "Invalid reset token" });
      if (resetToken.used) return res.status(400).json({ message: "This reset link has already been used" });
      if (new Date() > resetToken.expiresAt) return res.status(400).json({ message: "This reset link has expired" });

      const hashedPassword = await hashPassword(password);
      await storage.updateUser(resetToken.userId, { password: hashedPassword });
      await storage.markPasswordResetTokenUsed(resetToken.id);

      res.json({ message: "Password has been reset successfully" });
    } catch (err) {
      console.error("Reset password error:", err);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });
}
