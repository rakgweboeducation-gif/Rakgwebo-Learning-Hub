import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { useAuth } from "../hooks/use-auth";
import type { User, Announcement } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { TappableAvatar, ExpandableBio } from "../components/profile-viewer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { useToast } from "../hooks/use-toast";
import { Shield, UserCheck, Users, BookOpen, CheckCircle2, XCircle, Loader2, Building2, Save, Megaphone, Trash2, Send, Activity, Clock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Skeleton } from "../components/ui/skeleton";
import { useAnnouncements, useCreateAnnouncement, useDeleteAnnouncement } from "../hooks/use-modules";
import { apiUrl } from "../lib/api-config";

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allUsers, isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/admin/users"));
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const approveTutorMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/users/${userId}/approve-tutor`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Tutor approved successfully" });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}`, { role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User role updated" });
    },
  });

  const pendingTutors = allUsers?.filter(u => u.role === "tutor" && !u.isTutorApproved) || [];
  const approvedTutors = allUsers?.filter(u => u.role === "tutor" && u.isTutorApproved) || [];
  const learners = allUsers?.filter(u => u.role === "learner") || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Panel</h1>
        <p className="text-muted-foreground mt-1">Manage users, approve tutors, and oversee the platform.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allUsers?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
            <Shield className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{pendingTutors.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Tutors</CardTitle>
            <UserCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{approvedTutors.length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending Tutors {pendingTutors.length > 0 && <Badge variant="destructive" className="ml-2">{pendingTutors.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="all-users" data-testid="tab-all-users">All Users</TabsTrigger>
          <TabsTrigger value="business" data-testid="tab-business">
            <Building2 className="w-4 h-4 mr-1" /> Business Account
          </TabsTrigger>
          <TabsTrigger value="announcements" data-testid="tab-announcements">
            <Megaphone className="w-4 h-4 mr-1" /> Announcements
          </TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">
            <Activity className="w-4 h-4 mr-1" /> Activity Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
            </div>
          ) : pendingTutors.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mb-4 opacity-20" />
                <p>No pending tutor approvals.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {pendingTutors.map(tutor => (
                <Card key={tutor.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4">
                      <TappableAvatar
                        src={tutor.avatar}
                        fallback={(tutor.name || tutor.username).substring(0, 2).toUpperCase()}
                        name={tutor.name || tutor.username}
                        data-testid={`avatar-pending-${tutor.id}`}
                      />
                      <div>
                        <p className="font-medium">{tutor.name || tutor.username} {tutor.surname || ""}</p>
                        <p className="text-sm text-muted-foreground">@{tutor.username}</p>
                        {tutor.bio && <ExpandableBio bio={tutor.bio} className="mt-1" data-testid={`bio-pending-${tutor.id}`} />}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => approveTutorMutation.mutate(tutor.id)}
                        disabled={approveTutorMutation.isPending}
                        data-testid={`button-approve-${tutor.id}`}
                      >
                        {approveTutorMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                        Approve
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all-users" className="mt-6">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {allUsers?.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={u.avatar || undefined} />
                          <AvatarFallback>{(u.name || u.username).substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <TappableAvatar
                          src={u.avatar}
                          fallback={(u.name || u.username).substring(0, 2).toUpperCase()}
                          className="h-9 w-9"
                          name={u.name || u.username}
                          data-testid={`avatar-user-${u.id}`}
                        />
                        <div>
                          <p className="font-medium text-sm">{u.name || u.username} {u.surname || ""}</p>
                          <p className="text-xs text-muted-foreground">@{u.username}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {u.role === "tutor" && (
                          <Badge variant={u.isTutorApproved ? "default" : "secondary"}>
                            {u.isTutorApproved ? "Approved" : "Pending"}
                          </Badge>
                        )}
                        <Select
                          value={u.role}
                          onValueChange={(role) => {
                            if (u.id !== user?.id) {
                              changeRoleMutation.mutate({ userId: u.id, role });
                            }
                          }}
                          disabled={u.id === user?.id}
                        >
                          <SelectTrigger className="w-[130px]" data-testid={`select-role-${u.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="learner">Learner</SelectItem>
                            <SelectItem value="tutor">Tutor</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="business" className="mt-6">
          <BusinessAccountSettings />
        </TabsContent>

        <TabsContent value="announcements" className="mt-6">
          <AnnouncementsManager />
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <ActivityLogViewer />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BusinessAccountSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["/api/platform-settings"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/platform-settings"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json() as Promise<Record<string, string>>;
    },
  });

  const [businessName, setBusinessName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [accountType, setAccountType] = useState("cheque");
  const [accountHolder, setAccountHolder] = useState("");
  const [platformFeePercent, setPlatformFeePercent] = useState("15");
  const [customDomain, setCustomDomain] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setBusinessName(settings.business_name || "");
      setBankName(settings.bank_name || "");
      setAccountNumber(settings.bank_account_number || "");
      setBranchCode(settings.bank_branch_code || "");
      setAccountType(settings.bank_account_type || "cheque");
      setAccountHolder(settings.bank_account_holder || "");
      setPlatformFeePercent(settings.platform_fee_percent || "15");
      setCustomDomain(settings.customDomain || "");
    }
  }, [settings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await apiRequest("POST", "/api/platform-settings", {
        settings: {
          business_name: businessName,
          bank_name: bankName,
          bank_account_number: accountNumber,
          bank_branch_code: branchCode,
          bank_account_type: accountType,
          bank_account_holder: accountHolder,
          platform_fee_percent: platformFeePercent,
          customDomain: customDomain,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/platform-settings"] });
      toast({ title: "Business account details saved successfully" });
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Business Details
          </CardTitle>
          <CardDescription>Your business information for payment processing and receipts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="business-name">Business / Trading Name</Label>
            <Input
              id="business-name"
              placeholder="e.g. Rakgwebo Learning Hub (Pty) Ltd"
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
              data-testid="input-business-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="platform-fee">Platform Fee (%)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="platform-fee"
                type="number"
                min="0"
                max="50"
                value={platformFeePercent}
                onChange={e => setPlatformFeePercent(e.target.value)}
                className="w-24"
                data-testid="input-platform-fee"
              />
              <span className="text-sm text-muted-foreground">% deducted from each session payment</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="custom-domain">Custom Domain (for share links)</Label>
            <Input
              id="custom-domain"
              placeholder="e.g. learn.rakgwebo.co.za"
              value={customDomain}
              onChange={e => setCustomDomain(e.target.value)}
              data-testid="input-custom-domain"
            />
            <p className="text-xs text-muted-foreground">
              Set your custom domain so quiz share links use your domain instead of the default hosting URL.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Bank Account Details
          </CardTitle>
          <CardDescription>Where the platform's share of payments will be deposited.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="account-holder">Account Holder Name</Label>
            <Input
              id="account-holder"
              placeholder="e.g. Rakgwebo Learning Hub (Pty) Ltd"
              value={accountHolder}
              onChange={e => setAccountHolder(e.target.value)}
              data-testid="input-account-holder"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank-name">Bank Name</Label>
            <Input
              id="bank-name"
              placeholder="e.g. FNB, Standard Bank, Capitec, Nedbank, ABSA"
              value={bankName}
              onChange={e => setBankName(e.target.value)}
              data-testid="input-bank-name"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="account-number">Account Number</Label>
              <Input
                id="account-number"
                placeholder="e.g. 62123456789"
                value={accountNumber}
                onChange={e => setAccountNumber(e.target.value)}
                data-testid="input-account-number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-code">Branch Code</Label>
              <Input
                id="branch-code"
                placeholder="e.g. 250655"
                value={branchCode}
                onChange={e => setBranchCode(e.target.value)}
                data-testid="input-branch-code"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-type">Account Type</Label>
            <Select value={accountType} onValueChange={setAccountType}>
              <SelectTrigger className="w-full" data-testid="select-account-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cheque">Cheque / Current Account</SelectItem>
                <SelectItem value="savings">Savings Account</SelectItem>
                <SelectItem value="transmission">Transmission Account</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={isSaving} className="w-full md:w-auto" data-testid="button-save-business">
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
        Save Business Account Details
      </Button>
    </div>
  );
}

function AnnouncementsManager() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [targetRoles, setTargetRoles] = useState<string[]>(["learner", "tutor"]);
  const [targetGrades, setTargetGrades] = useState<number[]>([]);
  const [allGrades, setAllGrades] = useState(true);

  const { data: announcements, isLoading } = useAnnouncements();
  const createMutation = useCreateAnnouncement();
  const deleteMutation = useDeleteAnnouncement();

  const toggleRole = (role: string) => {
    setTargetRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const toggleGrade = (grade: number) => {
    setTargetGrades(prev =>
      prev.includes(grade) ? prev.filter(g => g !== grade) : [...prev, grade]
    );
  };

  const handleSend = () => {
    if (!title.trim() || !content.trim() || targetRoles.length === 0) return;
    createMutation.mutate({
      title: title.trim(),
      content: content.trim(),
      targetRoles,
      targetGrades: allGrades ? undefined : targetGrades,
    }, {
      onSuccess: () => {
        setTitle("");
        setContent("");
      }
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            New Announcement
          </CardTitle>
          <CardDescription>Send a message to learners and/or tutors</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ann-title">Title</Label>
            <Input id="ann-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Announcement title" data-testid="input-announcement-title" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ann-content">Message</Label>
            <Textarea id="ann-content" value={content} onChange={e => setContent(e.target.value)} placeholder="Write your announcement..." rows={4} data-testid="input-announcement-content" />
          </div>
          <div className="space-y-2">
            <Label>Target Audience</Label>
            <div className="flex gap-2">
              {["learner", "tutor"].map(role => (
                <Button key={role} variant={targetRoles.includes(role) ? "default" : "outline"} size="sm" onClick={() => toggleRole(role)} data-testid={`button-toggle-role-${role}`}>
                  {role === "learner" ? "Learners" : "Tutors"}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Grade Filter</Label>
              <Button variant={allGrades ? "default" : "outline"} size="sm" onClick={() => { setAllGrades(!allGrades); setTargetGrades([]); }} data-testid="button-toggle-all-grades">
                {allGrades ? "All Grades" : "Specific Grades"}
              </Button>
            </div>
            {!allGrades && (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(g => (
                  <Button key={g} variant={targetGrades.includes(g) ? "default" : "outline"} size="sm" className="w-12" onClick={() => toggleGrade(g)} data-testid={`button-grade-${g}`}>
                    {g}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <Button onClick={handleSend} disabled={!title.trim() || !content.trim() || targetRoles.length === 0 || createMutation.isPending} data-testid="button-send-announcement">
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Megaphone className="w-4 h-4 mr-2" />}
            Send Announcement
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Previous Announcements</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            </div>
          ) : !announcements || announcements.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No announcements yet.</p>
          ) : (
            <div className="space-y-3">
              {announcements.map((a: Announcement) => (
                <div key={a.id} className="flex items-start justify-between gap-4 p-4 rounded-lg border" data-testid={`announcement-item-${a.id}`}>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm">{a.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{a.content}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {a.targetRoles?.map((r: string) => (
                        <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
                      ))}
                      {a.targetGrades && a.targetGrades.length > 0 ? (
                        <Badge variant="outline" className="text-xs">Grades: {a.targetGrades.join(", ")}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">All grades</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{new Date(a.createdAt!).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(a.id)} disabled={deleteMutation.isPending} data-testid={`button-delete-announcement-${a.id}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface ActivityLogEntry {
  id: number;
  userId: number | null;
  userName: string | null;
  userRole: string | null;
  action: string;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
}

function ActivityLogViewer() {
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const { data, isLoading } = useQuery<{ logs: ActivityLogEntry[]; total: number }>({
    queryKey: ["/api/admin/activity-logs", { offset: page * pageSize, limit: pageSize }],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/admin/activity-logs?limit=${pageSize}&offset=${page * pageSize}`));
      if (!res.ok) throw new Error("Failed to fetch activity logs");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const actionLabels: Record<string, { label: string; color: string }> = {
    login: { label: "Login", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
    logout: { label: "Logout", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
    register: { label: "Registration", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
    help_request: { label: "Help Request", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
    book_session: { label: "Session Booked", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200" },
    approve_tutor: { label: "Tutor Approved", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
    change_role: { label: "Role Changed", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
    generate_quiz: { label: "Quiz Generated", color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200" },
    submit_quiz: { label: "Quiz Submitted", color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200" },
    create_announcement: { label: "Announcement", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
    delete_announcement: { label: "Announcement Deleted", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  };

  const formatFullTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-ZA", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Platform Activity Log
          </CardTitle>
          <CardDescription>
            Track all user activity across the platform — logins, registrations, quizzes, bookings, and more.
            {data && <span className="ml-2 font-medium">{data.total} total events</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !data?.logs.length ? (
            <p className="text-muted-foreground text-center py-8" data-testid="text-no-activity">No activity recorded yet.</p>
          ) : (
            <>
              <div className="space-y-2">
                {data.logs.map((log) => {
                  const actionInfo = actionLabels[log.action] || { label: log.action, color: "bg-gray-100 text-gray-700" };
                  return (
                    <div key={log.id} className="flex items-start gap-3 py-3 px-3 rounded-lg border hover:bg-muted/50 transition-colors" data-testid={`activity-log-${log.id}`}>
                      <div className="flex-shrink-0 mt-0.5">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`text-xs ${actionInfo.color}`} variant="secondary" data-testid={`badge-action-${log.id}`}>
                            {actionInfo.label}
                          </Badge>
                          {log.userName && (
                            <span className="text-sm font-medium" data-testid={`text-user-${log.id}`}>{log.userName}</span>
                          )}
                          {log.userRole && (
                            <Badge variant="outline" className="text-xs capitalize" data-testid={`badge-role-${log.id}`}>{log.userRole}</Badge>
                          )}
                        </div>
                        {log.details && (
                          <p className="text-sm text-muted-foreground mt-1 truncate" data-testid={`text-details-${log.id}`}>{log.details}</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-medium text-muted-foreground" data-testid={`text-time-${log.id}`}>{formatTime(log.createdAt)}</p>
                        <p className="text-xs text-muted-foreground/60" data-testid={`text-fulltime-${log.id}`}>{formatFullTime(log.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    data-testid="button-prev-page"
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground" data-testid="text-page-info">
                    Page {page + 1} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    data-testid="button-next-page"
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
