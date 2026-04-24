import { Link, useLocation } from "wouter";
import { useAuth } from "../hooks/use-auth";
import {
  LayoutDashboard,
  BookOpen,
  GraduationCap,
  MessageSquare,
  Calendar,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  BrainCircuit,
  HelpCircle,
  CreditCard,
  UserCircle,
  Video,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "../components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Sheet, SheetContent } from "../components/ui/sheet";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logoutMutation } = useAuth();
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const getInitials = (name?: string) => {
    return name ? name.substring(0, 2).toUpperCase() : "RM";
  };

  const navItems = [
    {
      label: "Dashboard",
      href: "/",
      icon: LayoutDashboard,
      roles: ["learner", "tutor", "admin"],
    },
    {
      label: "Textbooks",
      href: "/textbooks",
      icon: BookOpen,
      roles: ["learner", "admin"],
    },
    {
      label: "Learning Path",
      href: "/atp",
      icon: GraduationCap,
      roles: ["learner"],
    },
    {
      label: "Chat & Whiteboard",
      href: "/chat",
      icon: MessageSquare,
      roles: ["learner", "tutor"],
    },
    { label: "Find Tutor", href: "/tutors", icon: Users, roles: ["learner"] },
    {
      label: "Schedule",
      href: "/schedule",
      icon: Calendar,
      roles: ["tutor", "learner"],
    },
    {
      label: "Homework Help",
      href: "/ai-help",
      icon: BrainCircuit,
      roles: ["learner"],
    },
    {
      label: "Help Requests",
      href: "/help-requests",
      icon: HelpCircle,
      roles: ["tutor"],
    },
    {
      label: "Payments",
      href: "/payments",
      icon: CreditCard,
      roles: ["learner", "tutor"],
    },
    {
      label: "Live Classes",
      href: "/live-classes",
      icon: Video,
      roles: ["learner", "tutor"],
    },
    {
      label: "My Profile",
      href: "/profile",
      icon: UserCircle,
      roles: ["learner", "tutor", "admin"],
    },
    { label: "Admin Panel", href: "/admin", icon: Settings, roles: ["admin"] },
  ];

  const filteredNav = navItems.filter(
    (item) => user && item.roles.includes(user.role),
  );

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-slate-900 text-white">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          Rakgwebo
        </h1>
        <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-semibold">
          Learning Hub
        </p>
      </div>

      <div className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        {filteredNav.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;

          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer group",
                  isActive
                    ? "bg-primary text-white shadow-lg shadow-primary/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-800",
                )}
                onClick={() => setIsMobileOpen(false)}
              >
                <Icon
                  className={cn(
                    "w-5 h-5",
                    isActive
                      ? "text-white"
                      : "text-slate-400 group-hover:text-white",
                  )}
                />
                {item.label}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-3 mb-4 px-2">
          <Avatar className="h-9 w-9 border border-slate-700">
            <AvatarImage src={user?.avatar || undefined} />
            <AvatarFallback className="bg-slate-800 text-slate-300">
              {getInitials(user?.username)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user?.username}
            </p>
            <p className="text-xs text-slate-400 capitalize truncate">
              {user?.role}
            </p>
          </div>
        </div>

        <Link href="/profile">
          <div
            className="flex items-center gap-3 mb-4 px-2 cursor-pointer rounded-lg hover:bg-slate-800 py-2 transition-colors"
            onClick={() => setIsMobileOpen(false)}
          >
            <Avatar className="h-9 w-9 border border-slate-700">
              <AvatarImage src={user?.avatar || undefined} />
              <AvatarFallback className="bg-slate-800 text-slate-300">
                {getInitials(user?.username)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.username}
              </p>
              <p className="text-xs text-slate-400 capitalize truncate">
                {user?.role}
              </p>
            </div>
          </div>
        </Link>

        <Button
          variant="destructive"
          className="w-full justify-start pl-3"
          onClick={() => logoutMutation.mutate()}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Log Out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-64 flex-shrink-0 shadow-xl z-20">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 border-r-0">
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-4 bg-slate-900 text-white border-b border-slate-800">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Rakgwebo
          </h1>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          <div className="max-w-7xl mx-auto animate-enter">{children}</div>
        </div>
      </main>
    </div>
  );
}
