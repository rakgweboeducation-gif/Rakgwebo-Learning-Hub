# Replit.md

## Overview

This is **Rakgwebo Learning Hub** — a full-stack multi-subject education platform built for South African learners (Grades 1–12). It connects learners with tutors, provides access to curriculum-aligned textbooks, offers AI-powered homework help, and tracks progress through the Annual Teaching Plan (ATP). The platform supports three user roles: **learner**, **tutor**, and **admin**, each with role-specific dashboards and features.

Key features include:
- Progressive Web App (PWA) — installable on mobile and desktop with offline support
- Native push notifications with sound, vibration, and app icon badges for unread messages, announcements, session updates
- PDF textbook viewer with annotations (highlights and notes)
- ATP-based learning path aligned to the South African CAPS curriculum (7 subjects: Mathematics, Physical Sciences, Accounting, Economics, Life Sciences, Natural Sciences, Technology)
- Grade 1-12 support with age-appropriate content
- AI-powered homework help (step-by-step explanations with LaTeX rendering)
- AI-generated quizzes with LaTeX math rendering (KaTeX) and shareable links via custom domain
- Tutor discovery with availability calendar and session booking/scheduling
- Help request system (learners ask, tutors respond)
- Real-time chat functionality with whiteboard
- Admin panel for user management, tutor approval, announcements, and custom domain configuration for share links
- Password reset via email (nodemailer)
- Voice chat integration via OpenAI (Replit AI integrations)
- Live tutoring session rooms with WebRTC video/audio, infinite canvas whiteboard (pan/zoom), synced textbook viewing, and in-session chat
- Profile picture upload (file-based, not URL) and bio editing
- Payment system with card management, authorization/capture flow, and tutor earnings tracking
- Automatic payment capture on session completion (both manual end and timer expiry), with scheduler safety net for orphaned payments
- Automatic payment capture on session completion (both manual end and timer expiry), with scheduler safety net for orphaned payments; stale closure fix ensures accurate duration billing
- Live Classes feature: tutors broadcast live group sessions with infinite-canvas whiteboard (pan/zoom), real-time chat, participant list — all synced via dedicated WebSocket (/ws/class)
- WebSocket connection reliability: server-side ping/pong heartbeat (25s interval, 50s timeout) on both `/ws/session` and `/ws/class`, client-side application-level ping every 20s, exponential backoff reconnection (1s–15s), automatic room rejoin on reconnect, WebRTC renegotiation after reconnect, stale connection cleanup, aliveMap updated on every incoming message (not just protocol pong)
- Real-time draw streaming: pen/eraser strokes stream points to other users at ~30fps via `draw-stream` messages during drawing (batched every 33ms), so remote users see strokes appear in real-time rather than only after pen-up. Final stroke sent as `whiteboard-action` on pen-up replaces the preview. Points simplified via Douglas-Peucker algorithm before final send to reduce payload size. Pan state updates throttled via RAF to prevent re-render storms. WebSocket send has bufferedAmount backpressure check (64KB threshold) that skips non-critical messages but always allows drawing/whiteboard messages through.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight alternative to React Router)
- **State Management**: TanStack React Query for server state; React context for auth state
- **UI Components**: shadcn/ui (new-york style) built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Forms**: React Hook Form with Zod resolvers for validation
- **Build Tool**: Vite with React plugin
- **Math Rendering**: KaTeX for LaTeX equations
- **Icons**: Lucide React
- **Path Aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

The frontend lives in `client/src/` with pages in `pages/`, shared UI in `components/ui/`, custom hooks in `hooks/`, and utilities in `lib/`. Role-based routing is handled via a `ProtectedRoute` wrapper component in `App.tsx`.

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript, executed via `tsx` in development
- **API Design**: RESTful JSON API, all routes prefixed with `/api/`
- **Authentication**: Passport.js with local strategy (username/password), express-session with PostgreSQL session store (`connect-pg-simple`)
- **Password Hashing**: Node.js `crypto.scrypt` with random salt
- **Build**: esbuild for server bundling, Vite for client bundling (see `script/build.ts`)
- **Route Definition**: Centralized route contracts in `shared/routes.ts` with Zod schemas for input validation

The server entry point is `server/index.ts`. Routes are registered in `server/routes.ts`. Auth setup is in `server/auth.ts`. In development, Vite dev server middleware is used; in production, static files are served from `dist/public`.

### Data Storage
- **Database**: PostgreSQL (required, via `DATABASE_URL` environment variable)
- **ORM**: Drizzle ORM with `drizzle-zod` for schema-to-validation integration
- **Schema Location**: `shared/schema.ts` (shared between client and server)
- **Migrations**: Generated via `drizzle-kit push` (stores migration files in `./migrations`)
- **Session Store**: PostgreSQL-backed via `connect-pg-simple`

Key tables:
- `users` — learners, tutors, admins with role enum, grade, profile fields
- `password_reset_tokens` — for email-based password reset flow
- `textbooks` — curriculum textbooks with grade, URL, cover
- `annotations` — user annotations on textbook pages (highlights/notes)
- `help_requests` — learner questions routed to tutors
- `chat_sessions` / `chat_messages` — messaging between users
- `atp_topics` — Annual Teaching Plan topics by grade/term/week
- `diagnostic_tests` / `test_results` — assessments and results
- `tutor_sessions` — scheduled tutoring sessions with status tracking
- `conversations` / `messages` — AI chat conversations (from Replit integrations)
- `tutor_availability` — recurring weekly time slots for tutor scheduling
- `quiz_sessions` — AI-generated quizzes with shareable tokens
- `announcements` — admin announcements with role/grade targeting
- `tutor_rates` / `payment_methods` / `payments` — payment system
- `tutor_bank_details` — tutor banking info for payouts
- `activity_logs` — platform activity tracking (logins, registrations, bookings, quizzes, etc.) for admin oversight

### Storage Layer
The storage interface is defined in `server/storage.ts` as `IStorage`, providing a clean abstraction over all database operations. This makes it possible to swap implementations if needed.

### Shared Code
The `shared/` directory contains code used by both client and server:
- `schema.ts` — Drizzle table definitions, insert schemas, and TypeScript types
- `routes.ts` — API route contracts with Zod input/output schemas
- `models/chat.ts` — Conversation/message table definitions for AI chat

### Replit AI Integrations
Located in `server/replit_integrations/` and `client/replit_integrations/`:
- **Chat** (`chat/`) — OpenAI-powered conversational AI with conversation persistence
- **Audio** (`audio/`) — Voice recording, playback, and streaming via OpenAI TTS/STT
- **Image** (`image/`) — Image generation via `gpt-image-1`
- **Batch** (`batch/`) — Batch processing utilities with rate limiting and retries

These integrations use environment variables `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL`.

## External Dependencies

### Required Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (must be provisioned)
- `SESSION_SECRET` — Secret for express-session (has a fallback default, but should be set)
- `AI_INTEGRATIONS_OPENAI_API_KEY` — OpenAI API key for AI features
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — OpenAI base URL (Replit AI proxy)

### Third-Party Services
- **PostgreSQL** — Primary database for all application data and sessions
- **OpenAI API** (via Replit AI Integrations) — Powers AI math help, voice chat, image generation
- **Nodemailer** — Email sending for password reset flows (needs SMTP configuration)
- **Google Fonts** — Custom typography (Plus Jakarta Sans, Outfit, JetBrains Mono, DM Sans, Fira Code, Geist Mono, Architects Daughter)

### Key NPM Packages
- `drizzle-orm` / `drizzle-kit` — Database ORM and migration tooling
- `passport` / `passport-local` — Authentication
- `express-session` / `connect-pg-simple` — Session management
- `@tanstack/react-query` — Server state management
- `wouter` — Client-side routing
- `zod` / `drizzle-zod` — Schema validation
- `react-hook-form` / `@hookform/resolvers` — Form handling
- `shadcn/ui` components (Radix UI primitives) — UI component library
- `katex` / `react-latex-next` — Math equation rendering
- `react-markdown` — Markdown rendering for AI responses
- `date-fns` / `react-day-picker` — Date handling and calendar UI
- `recharts` — Data visualization
- `framer-motion` — Animations
- `nanoid` — ID generation
- `multer` — File upload handling
- `stripe` — Payment processing (dependency present, integration TBD)
- `ws` — WebSocket support
- `xlsx` — Excel file processing