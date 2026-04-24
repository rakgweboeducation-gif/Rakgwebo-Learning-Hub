import { useState, useEffect } from "react";
import { useAuth } from "../hooks/use-auth";
import { useTutorSessions, useUpdateTutorSession, useTutorAvailability, useSetTutorAvailability } from "../hooks/use-modules";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Calendar, Clock, CheckCircle2, XCircle, Loader2, ExternalLink, Video, Plus, Trash2, Save, Mic, Play, Download } from "lucide-react";
import { useLocation } from "wouter";
import { Skeleton } from "../components/ui/skeleton";
import { Separator } from "../components/ui/separator";
import { cn } from "../lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { useToast } from "../hooks/use-toast";

const statusColors: Record<string, string> = {
  requested: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  completed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  rejected: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface AvailabilitySlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export default function SchedulePage() {
  const { user } = useAuth();
  const { data: sessions, isLoading } = useTutorSessions();
  const updateSession = useUpdateTutorSession();
  const [, navigate] = useLocation();

  const isTutor = user?.role === "tutor";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-schedule-title">
          {isTutor ? "My Schedule" : "My Sessions"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {isTutor ? "Manage your availability and tutoring requests." : "Track your booked tutoring sessions."}
        </p>
      </div>

      {isTutor && <AvailabilityManager />}

      <RecordingsSection />

      <div>
        <h2 className="text-xl font-semibold mb-4" data-testid="text-sessions-heading">
          {isTutor ? "Session Requests" : "Booked Sessions"}
        </h2>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
          </div>
        ) : !sessions || sessions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Calendar className="w-12 h-12 mb-4 opacity-20" />
              <p className="font-medium">No sessions yet</p>
              <p className="text-sm mt-1">{isTutor ? "Waiting for learner requests." : "Find a tutor to book a session."}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {sessions.map(session => (
              <Card key={session.id}>
                <CardContent className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{session.topic || "General Tutoring"}</h3>
                      <Badge className={statusColors[session.status || "requested"]} variant="secondary">
                        {session.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(session.startTime).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {" - "}
                        {new Date(session.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {session.meetingLink && (
                      <a href={session.meetingLink} target="_blank" rel="noopener noreferrer" className="text-sm text-primary flex items-center gap-1">
                        <ExternalLink className="w-3.5 h-3.5" />
                        Join Meeting
                      </a>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {session.status === "accepted" && new Date(session.endTime) > new Date() && (
                      <Button
                        onClick={() => navigate(`/session/${session.id}`)}
                        className="bg-green-600 hover:bg-green-700"
                        data-testid={`button-join-session-${session.id}`}
                      >
                        <Video className="w-4 h-4 mr-2" />
                        Join Live Session
                      </Button>
                    )}
                    {session.status === "accepted" && new Date(session.endTime) <= new Date() && (
                      <Badge variant="secondary" className="text-xs">Session time ended</Badge>
                    )}
                    {isTutor && session.status === "requested" && (
                      <>
                        <Button
                          onClick={() => updateSession.mutate({ id: session.id, status: "accepted" })}
                          disabled={updateSession.isPending}
                          data-testid={`button-accept-${session.id}`}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Accept
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => updateSession.mutate({ id: session.id, status: "rejected" })}
                          disabled={updateSession.isPending}
                          data-testid={`button-reject-${session.id}`}
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AvailabilityManager() {
  const { user } = useAuth();
  const { data: existingSlots, isLoading } = useTutorAvailability(user?.id || 0);
  const setAvailability = useSetTutorAvailability();
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);

  useEffect(() => {
    if (existingSlots) {
      setSlots(existingSlots.map(s => ({
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
      })));
    }
  }, [existingSlots]);

  const addSlot = () => {
    setSlots(prev => [...prev, { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }]);
  };

  const removeSlot = (index: number) => {
    setSlots(prev => prev.filter((_, i) => i !== index));
  };

  const updateSlot = (index: number, field: keyof AvailabilitySlot, value: string | number) => {
    setSlots(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const handleSave = () => {
    if (!user) return;
    const fullSlots = slots.map(s => ({
      ...s,
      tutorId: user.id,
      isRecurring: true,
      specificDate: null,
    }));
    setAvailability.mutate(fullSlots);
  };

  const slotsGroupedByDay = DAY_NAMES.map((name, i) => ({
    day: i,
    name,
    short: DAY_SHORT[i],
    slots: slots.filter(s => s.dayOfWeek === i),
  })).filter(g => g.slots.length > 0);

  return (
    <Card data-testid="card-availability">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          My Availability
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Set your available time slots so learners know when to book.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm text-muted-foreground">Loading availability...</span>
          </div>
        ) : (
          <>
            {slots.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">
                No availability set yet. Add time slots to let learners know when you're free.
              </p>
            )}

            <div className="space-y-3">
              {slots.map((slot, index) => (
                <div key={index} className="flex items-center gap-2 flex-wrap" data-testid={`slot-${index}`}>
                  <select
                    value={slot.dayOfWeek}
                    onChange={e => updateSlot(index, "dayOfWeek", parseInt(e.target.value))}
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    data-testid={`select-day-${index}`}
                  >
                    {DAY_NAMES.map((name, i) => (
                      <option key={i} value={i}>{name}</option>
                    ))}
                  </select>
                  <Input
                    type="time"
                    value={slot.startTime}
                    onChange={e => updateSlot(index, "startTime", e.target.value)}
                    className="w-28"
                    data-testid={`input-start-${index}`}
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <Input
                    type="time"
                    value={slot.endTime}
                    onChange={e => updateSlot(index, "endTime", e.target.value)}
                    className="w-28"
                    data-testid={`input-end-${index}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeSlot(index)}
                    className="h-9 w-9 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                    data-testid={`button-remove-slot-${index}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={addSlot} data-testid="button-add-slot">
                <Plus className="w-4 h-4 mr-1" />
                Add Time Slot
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={setAvailability.isPending}
                data-testid="button-save-availability"
              >
                {setAvailability.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-1" />
                )}
                Save Availability
              </Button>
            </div>

            {slotsGroupedByDay.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Preview</p>
                  <div className="flex flex-wrap gap-2">
                    {slotsGroupedByDay.map(g => (
                      <div key={g.day} className="text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 rounded-md px-2 py-1.5">
                        <span className="font-medium">{g.short}:</span>{" "}
                        {g.slots.map((s, i) => (
                          <span key={i}>
                            {i > 0 && ", "}
                            {s.startTime}-{s.endTime}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RecordingsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: recordings, isLoading } = useQuery<any[]>({
    queryKey: ["/api/my-recordings"],
  });

  const deleteRecording = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/session-recordings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-recordings"] });
      toast({ title: "Recording deleted" });
    },
  });

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "Unknown";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoading) return null;
  if (!recordings || recordings.length === 0) return null;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <Mic className="w-5 h-5 text-primary" />
        Session Recordings
      </h2>
      <div className="space-y-3">
        {recordings.map((rec: any) => (
          <Card key={rec.id}>
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Mic className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">Session #{rec.sessionId} Recording</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(rec.createdAt).toLocaleDateString()} at {new Date(rec.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {rec.durationSeconds ? ` · ${formatDuration(rec.durationSeconds)}` : ""}
                    {rec.fileSizeBytes ? ` · ${formatFileSize(rec.fileSizeBytes)}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                  data-testid={`button-play-recording-${rec.id}`}
                >
                  <a href={rec.filePath} target="_blank" rel="noopener noreferrer" download>
                    <Download className="w-3.5 h-3.5 mr-1" />
                    Download
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => deleteRecording.mutate(rec.id)}
                  disabled={deleteRecording.isPending}
                  data-testid={`button-delete-recording-${rec.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
