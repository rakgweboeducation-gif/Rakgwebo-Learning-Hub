import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Camera } from "lucide-react";
import { apiUrl } from "@/lib/api-config";

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user?.name || "");
  const [surname, setSurname] = useState(user?.surname || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [grade, setGrade] = useState(String(user?.grade || "10"));
  const [avatar, setAvatar] = useState(user?.avatar || "");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (user && !hydrated) {
      setName(user.name || "");
      setSurname(user.surname || "");
      setBio(user.bio || "");
      setGrade(String(user.grade || "10"));
      setAvatar(user.avatar || "");
      setHydrated(true);
    }
  }, [user, hydrated]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/users/${user!.id}`, data);
      return res.json();
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["/api/user"], updatedUser);
      toast({ title: "Profile updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update profile", variant: "destructive" });
    },
  });

  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await fetch(apiUrl("/api/profile/avatar"), {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: (data) => {
      setAvatar(data.url);
      if (data.user) {
        queryClient.setQueryData(["/api/user"], data.user);
      }
      toast({ title: "Profile photo updated" });
    },
    onError: () => {
      toast({ title: "Failed to upload photo", variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      avatarMutation.mutate(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      name,
      surname,
      bio,
      grade: parseInt(grade),
      avatar: avatar || null,
    });
  };

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-profile-title">My Profile</h1>
        <p className="text-muted-foreground mt-1">Update your personal information.</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex items-center gap-6">
              <div className="relative group">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={avatar || undefined} />
                  <AvatarFallback className="text-2xl">{(name || user.username).substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  data-testid="button-upload-avatar"
                  disabled={avatarMutation.isPending}
                >
                  {avatarMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <div className="flex flex-col items-center gap-0.5">
                      <Camera className="w-5 h-5" />
                      <span className="text-xs font-medium">Change Photo</span>
                    </div>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                  data-testid="input-avatar-file"
                />
              </div>
              <div className="flex-1">
                <p className="font-medium text-lg" data-testid="text-username">{user.username}</p>
                <p className="text-sm text-muted-foreground">{user.role}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarMutation.isPending}
                  data-testid="button-upload-avatar-alt"
                >
                  {avatarMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Camera className="w-4 h-4 mr-2" />
                  )}
                  Upload Photo
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} data-testid="input-name" />
              </div>
              <div className="space-y-2">
                <Label>Surname</Label>
                <Input value={surname} onChange={e => setSurname(e.target.value)} data-testid="input-surname" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Grade</Label>
              <Select value={grade} onValueChange={setGrade}>
                <SelectTrigger data-testid="select-grade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
                    <SelectItem key={g} value={String(g)}>Grade {g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Bio</Label>
              <Textarea
                placeholder="Tell us about yourself..."
                value={bio}
                onChange={e => setBio(e.target.value)}
                data-testid="input-bio"
              />
            </div>

            <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-profile">
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
