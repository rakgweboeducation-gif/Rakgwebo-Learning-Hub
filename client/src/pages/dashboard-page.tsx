import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, GraduationCap, Users, BrainCircuit, MessageSquare, Calendar, ArrowRight, Megaphone } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAnnouncements } from "@/hooks/use-modules";
import type { Announcement } from "@shared/schema";

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: textbooks } = useQuery<any[]>({
    queryKey: ["/api/textbooks"],
  });

  const { data: sessions } = useQuery<any[]>({
    queryKey: ["/api/tutor-sessions"],
  });

  const { data: announcements } = useAnnouncements();

  if (!user) return null;

  const textbookCount = textbooks?.length ?? 0;
  const upcomingSessions = sessions?.filter((s: any) => s.status === "confirmed" || s.status === "requested")?.length ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-welcome">
            Welcome back, {user.name || user.username}!
          </h1>
          <p className="text-muted-foreground mt-1">
            Here's what's happening in your maths journey today.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/ai-help">
            <Button data-testid="button-ai-help">
              <BrainCircuit className="w-4 h-4 mr-2" />
              Homework Help
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/atp">
          <StatsCard
            title="Learning Path"
            value={`Grade ${user.grade || 10}`}
            icon={GraduationCap}
            description="View curriculum topics"
            color="text-blue-500"
            bg="bg-blue-50 dark:bg-blue-900/20"
          />
        </Link>
        <Link href="/textbooks">
          <StatsCard
            title="Textbooks"
            value={`${textbookCount} Available`}
            icon={BookOpen}
            description="View resources"
            color="text-emerald-500"
            bg="bg-emerald-50 dark:bg-emerald-900/20"
          />
        </Link>
        <Link href="/tutors">
          <StatsCard
            title="Find Tutor"
            value="Browse Tutors"
            icon={Users}
            description="Book a session"
            color="text-purple-500"
            bg="bg-purple-50 dark:bg-purple-900/20"
          />
        </Link>
        <Link href="/schedule">
          <StatsCard
            title="My Sessions"
            value={`${upcomingSessions} Upcoming`}
            icon={Calendar}
            description="View schedule"
            color="text-amber-500"
            bg="bg-amber-50 dark:bg-amber-900/20"
          />
        </Link>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Card className="col-span-1 shadow-md border-slate-200 dark:border-slate-700">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Jump to the features you need</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Link href="/ai-help">
                <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700 cursor-pointer" data-testid="link-ai-help">
                  <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                    <BrainCircuit className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Homework Help</p>
                    <p className="text-xs text-muted-foreground">Get AI-powered step-by-step solutions</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </Link>
              <Link href="/chat">
                <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700 cursor-pointer" data-testid="link-chat">
                  <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                    <MessageSquare className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Chat & Whiteboard</p>
                    <p className="text-xs text-muted-foreground">Message tutors and collaborate</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </Link>
              <Link href="/tutors">
                <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700 cursor-pointer" data-testid="link-tutors">
                  <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                    <Users className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Find a Tutor</p>
                    <p className="text-xs text-muted-foreground">Browse and book sessions</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </Link>
              <Link href="/atp">
                <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700 cursor-pointer" data-testid="link-learning-path">
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                    <GraduationCap className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Learning Path</p>
                    <p className="text-xs text-muted-foreground">Follow your CAPS curriculum</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1 shadow-md border-slate-200 dark:border-slate-700">
          <CardHeader>
            <CardTitle>Recommended for You</CardTitle>
            <CardDescription>Based on your grade level</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Link href="/atp">
                <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-slate-800 dark:to-slate-900 border border-indigo-100 dark:border-slate-700 cursor-pointer hover:shadow-md transition-shadow">
                  <h4 className="font-semibold text-indigo-900 dark:text-indigo-100 mb-1">Explore Your Curriculum</h4>
                  <p className="text-sm text-indigo-700 dark:text-indigo-300 mb-3">
                    Check out the Grade {user.grade || 10} learning path with topics aligned to CAPS.
                  </p>
                  <Button variant="outline" size="sm">
                    Start Learning <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </Link>
              <Link href="/textbooks">
                <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-green-50 dark:from-slate-800 dark:to-slate-900 border border-emerald-100 dark:border-slate-700 cursor-pointer hover:shadow-md transition-shadow">
                  <h4 className="font-semibold text-emerald-900 dark:text-emerald-100 mb-1">Browse Textbooks</h4>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-3">
                    Access your Grade {user.grade || 10} mathematics textbook.
                  </p>
                  <Button variant="outline" size="sm">
                    View Textbooks <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {announcements && announcements.length > 0 && (
        <Card className="shadow-md border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-amber-600" />
              <CardTitle>Announcements</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {announcements.map((a: Announcement) => (
                <div key={a.id} className="p-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900" data-testid={`announcement-${a.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-semibold text-sm">{a.title}</h4>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {new Date(a.createdAt!).toLocaleDateString()}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{a.content}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatsCard({ title, value, icon: Icon, description, color, bg }: any) {
  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 border-slate-200 dark:border-slate-700 cursor-pointer hover:-translate-y-0.5 transition-transform">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={`p-2 rounded-lg ${bg}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}
