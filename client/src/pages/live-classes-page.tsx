import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { TappableAvatar } from "@/components/profile-viewer";
import { Video, Radio, Users, Clock, BookOpen, Plus, GraduationCap, Wifi } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const SUBJECTS = [
  "Mathematics", "Physical Sciences", "Accounting", "Economics",
  "Life Sciences", "Natural Sciences", "Technology", "English", "History", "Geography", "Other"
];

type LiveClassWithTutor = {
  id: number;
  tutorId: number;
  title: string;
  subject: string | null;
  description: string | null;
  grade: number | null;
  status: "live" | "ended";
  createdAt: string;
  endedAt: string | null;
  tutor: { id: number; username: string; name: string | null; surname: string | null; avatar: string | null };
};

export default function LiveClassesPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [grade, setGrade] = useState("");
  const [tab, setTab] = useState<"live" | "ended">("live");

  const { data: liveClasses = [], isLoading } = useQuery<LiveClassWithTutor[]>({
    queryKey: ["/api/live-classes", tab],
    queryFn: () => apiRequest("GET", `/api/live-classes?status=${tab}`).then(r => r.json()),
    refetchInterval: 10000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/live-classes", {
        title: title.trim(),
        subject: subject || null,
        description: description.trim() || null,
        grade: grade && grade !== "all" ? parseInt(grade) : null,
        status: "live",
      });
      return res.json();
    },
    onSuccess: (cls: LiveClassWithTutor) => {
      queryClient.invalidateQueries({ queryKey: ["/api/live-classes"] });
      setShowCreate(false);
      setTitle(""); setSubject(""); setDescription(""); setGrade("");
      toast({ title: "Class started!", description: "Learners can now join your class." });
      navigate(`/class/${cls.id}`);
    },
    onError: () => toast({ title: "Failed to start class", variant: "destructive" }),
  });

  const isTutor = user?.role === "tutor";

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Video className="w-8 h-8 text-primary" />
            Live Classes
          </h1>
          <p className="text-muted-foreground mt-1">
            {isTutor ? "Start a live class or view your past sessions." : "Join a live class or catch up on recent ones."}
          </p>
        </div>
        {isTutor && (
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button data-testid="button-start-class">
                <Radio className="w-4 h-4 mr-2" />
                Start Live Class
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Start a Live Class</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Class Title *</Label>
                  <Input
                    placeholder="e.g. Algebra Basics — Chapter 5"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    data-testid="input-class-title"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Select value={subject} onValueChange={setSubject}>
                      <SelectTrigger data-testid="select-subject">
                        <SelectValue placeholder="Select subject" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Grade (optional)</Label>
                    <Select value={grade} onValueChange={setGrade}>
                      <SelectTrigger data-testid="select-grade">
                        <SelectValue placeholder="All grades" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Grades</SelectItem>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(g => (
                          <SelectItem key={g} value={String(g)}>Grade {g}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Textarea
                    placeholder="What will you cover in this class?"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={3}
                    data-testid="input-class-description"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button
                    className="flex-1"
                    onClick={() => createMutation.mutate()}
                    disabled={!title.trim() || createMutation.isPending}
                    data-testid="button-confirm-start-class"
                  >
                    <Radio className="w-4 h-4 mr-2" />
                    {createMutation.isPending ? "Starting..." : "Go Live"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab("live")}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${tab === "live" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          data-testid="tab-live"
        >
          <span className="flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5" />
            Live Now
            {liveClasses.filter(c => c.status === "live").length > 0 && tab !== "live" && (
              <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">
                {liveClasses.filter(c => c.status === "live").length}
              </Badge>
            )}
          </span>
        </button>
        <button
          onClick={() => setTab("ended")}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${tab === "ended" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          data-testid="tab-ended"
        >
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Past Classes
          </span>
        </button>
      </div>

      {/* Classes grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : liveClasses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpen className="w-12 h-12 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground font-medium">
            {tab === "live" ? "No live classes right now" : "No past classes yet"}
          </p>
          {tab === "live" && isTutor && (
            <p className="text-sm text-muted-foreground mt-1">Click "Start Live Class" to begin teaching!</p>
          )}
          {tab === "live" && !isTutor && (
            <p className="text-sm text-muted-foreground mt-1">Check back soon — tutors will start classes here.</p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {liveClasses.map(cls => (
            <ClassCard key={cls.id} cls={cls} user={user} onJoin={() => navigate(`/class/${cls.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClassCard({ cls, user, onJoin }: { cls: LiveClassWithTutor; user: any; onJoin: () => void }) {
  const tutorName = cls.tutor.name
    ? `${cls.tutor.name}${cls.tutor.surname ? " " + cls.tutor.surname : ""}`
    : cls.tutor.username;

  return (
    <Card className={`transition-all hover:shadow-md ${cls.status === "live" ? "border-primary/30 bg-primary/5" : ""}`} data-testid={`card-class-${cls.id}`}>
      <CardContent className="p-5">
        <div className="flex items-start gap-3 mb-3">
          <TappableAvatar
            src={cls.tutor.avatar}
            fallback={tutorName.substring(0, 2).toUpperCase()}
            className="h-10 w-10"
            name={tutorName}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {cls.status === "live" ? (
                <Badge variant="destructive" className="text-xs flex items-center gap-1 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  LIVE
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">Ended</Badge>
              )}
              {cls.subject && <Badge variant="outline" className="text-xs">{cls.subject}</Badge>}
              {cls.grade && (
                <Badge variant="outline" className="text-xs">
                  <GraduationCap className="w-3 h-3 mr-0.5" />
                  Grade {cls.grade}
                </Badge>
              )}
            </div>
            <h3 className="font-semibold mt-1 leading-tight" data-testid={`text-class-title-${cls.id}`}>{cls.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">by {tutorName}</p>
          </div>
        </div>

        {cls.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{cls.description}</p>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {cls.status === "live"
              ? `Started ${formatDistanceToNow(new Date(cls.createdAt))} ago`
              : `Ended ${formatDistanceToNow(new Date(cls.endedAt || cls.createdAt))} ago`}
          </span>
          <Button
            size="sm"
            variant={cls.status === "live" ? "default" : "outline"}
            onClick={onJoin}
            disabled={cls.status === "ended" && user?.role !== "tutor"}
            data-testid={`button-join-class-${cls.id}`}
          >
            {cls.status === "live" ? (
              <><Users className="w-3.5 h-3.5 mr-1.5" />Join</>
            ) : (
              <><Clock className="w-3.5 h-3.5 mr-1.5" />View</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
