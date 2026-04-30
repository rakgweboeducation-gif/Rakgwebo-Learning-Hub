import { Switch, Route, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider, useAuth } from "./hooks/use-auth";
import { Layout } from "./components/layout";
import { Loader2 } from "lucide-react";
import { NotificationManager } from "./components/notification-manager";

// Pages
import AuthPage from "./pages/auth-page";
import DashboardPage from "./pages/dashboard-page";
import NotFound from "./pages/not-found";
import TextbooksPage from "./pages/textbooks-page";
import ATPPage from "./pages/atp-page";
import AIHelpPage from "./pages/ai-help-page";
import AdminPage from "./pages/admin-page";
import ChatPage from "./pages/chat-page";
import TutorsPage from "./pages/tutors-page";
import SchedulePage from "./pages/schedule-page";
import HelpRequestsPage from "./pages/help-requests-page";
import ProfilePage from "./pages/profile-page";
import ForgotPasswordPage from "./pages/forgot-password-page";
import ResetPasswordPage from "./pages/reset-password-page";
import TextbookViewerPage from "./pages/textbook-viewer-page";
import SessionRoomPage from "./pages/session-room-page";
import PaymentsPage from "./pages/payments-page";
import QuizSharePage from "./pages/quiz-share-page";
import LiveClassesPage from "./pages/live-classes-page";
import ClassRoomPage from "./pages/class-room-page";

function Toaster() {
  return null;
}

function ProtectedRoute({
  component: Component,
  roles,
}: {
  component: React.ComponentType<any>;
  roles?: string[];
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-white">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) return <Redirect to="/auth" />;
  if (roles && !roles.includes(user.role)) return <Redirect to="/" />;

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      {/* PUBLIC ROUTES FIRST */}
      <Route path="/auth" component={AuthPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />

      <Route path="/quiz/:token">
        {(params) => <QuizSharePage token={params.token} />}
      </Route>

      {/* PROTECTED ROUTES */}
      <Route path="/textbooks">
        <ProtectedRoute
          component={TextbooksPage}
          roles={["learner", "admin"]}
        />
      </Route>

      <Route path="/textbooks/:id">
        {(params) => (
          <ProtectedRoute
            component={() => <TextbookViewerPage id={params.id} />}
            roles={["learner", "tutor", "admin"]}
          />
        )}
      </Route>

      <Route path="/atp">
        <ProtectedRoute component={ATPPage} roles={["learner"]} />
      </Route>

      <Route path="/ai-help">
        <ProtectedRoute component={AIHelpPage} roles={["learner"]} />
      </Route>

      <Route path="/admin">
        <ProtectedRoute component={AdminPage} roles={["admin"]} />
      </Route>

      <Route path="/chat">
        <ProtectedRoute component={ChatPage} />
      </Route>

      <Route path="/tutors">
        <ProtectedRoute component={TutorsPage} roles={["learner"]} />
      </Route>

      <Route path="/schedule">
        <ProtectedRoute component={SchedulePage} roles={["learner", "tutor"]} />
      </Route>

      <Route path="/help-requests">
        <ProtectedRoute
          component={HelpRequestsPage}
          roles={["tutor", "admin"]}
        />
      </Route>

      <Route path="/payments">
        <ProtectedRoute component={PaymentsPage} roles={["learner", "tutor"]} />
      </Route>

      <Route path="/profile">
        <ProtectedRoute component={ProfilePage} />
      </Route>

      <Route path="/session/:id">
        {(params) => {
          const { user, isLoading } = useAuth();

          if (isLoading) return <Loader2 className="animate-spin" />;
          if (!user) return <Redirect to="/auth" />;

          return <SessionRoomPage sessionId={params.id} />;
        }}
      </Route>

      <Route path="/live-classes">
        <ProtectedRoute
          component={LiveClassesPage}
          roles={["learner", "tutor"]}
        />
      </Route>

      <Route path="/class/:id">
        {(params) => {
          const { user, isLoading } = useAuth();

          if (isLoading) return <Loader2 className="animate-spin" />;
          if (!user) return <Redirect to="/auth" />;

          return <ClassRoomPage />;
        }}
      </Route>

      {/* ✅ ROOT LAST (THIS FIXES EVERYTHING) */}
      <Route path="/">
        <ProtectedRoute component={DashboardPage} />
      </Route>

      {/* 404 LAST */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
        <NotificationManager />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
