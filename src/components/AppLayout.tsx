import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, MessageSquare, LogOut, LayoutDashboard, Calendar, FolderLock, BookOpen, Home, Users, GraduationCap, Settings } from "lucide-react";
import { useAuth, primaryRole, type Role } from "@/lib/auth";
import type { ReactNode } from "react";

function NavItem({ to, icon: Icon, children }: { to: string; icon: any; children: ReactNode }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const active = path === to || path.startsWith(to + "/");
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors border-l-2 ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground border-sidebar-primary font-medium"
          : "text-sidebar-foreground border-transparent hover:bg-sidebar-accent/50"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{children}</span>
    </Link>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, roles, signOut } = useAuth();
  const navigate = useNavigate();
  const role: Role = primaryRole(roles);

  const initials = (profile?.full_name || profile?.email || "U")
    .split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Topbar */}
      <header className="h-14 bg-topbar text-topbar-foreground flex items-center px-4 gap-4 shadow-sm">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <GraduationCap className="h-6 w-6" />
          <span>IDF — Instituto Digital de Formação</span>
        </Link>
        <div className="flex-1" />
        <button className="p-2 hover:bg-white/10 rounded-md" aria-label="Mensagens">
          <MessageSquare className="h-5 w-5" />
        </button>
        <button className="p-2 hover:bg-white/10 rounded-md" aria-label="Notificações">
          <Bell className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-semibold">
              {initials}
            </div>
          )}
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-sm font-medium">{profile?.full_name || profile?.email}</span>
            <span className="text-[11px] uppercase tracking-wide opacity-80">{role}</span>
          </div>
        </div>
        <button
          onClick={async () => { await signOut(); navigate({ to: "/login" }); }}
          className="p-2 hover:bg-white/10 rounded-md" aria-label="Sair"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-60 bg-sidebar border-r border-sidebar-border py-3 hidden md:block">
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Navegação
          </div>
          {role === "student" && (
            <>
              <NavItem to="/student/dashboard" icon={LayoutDashboard}>Painel do utilizador</NavItem>
              <NavItem to="/" icon={Home}>Página inicial</NavItem>
              <NavItem to="/student/calendar" icon={Calendar}>Calendário</NavItem>
              <NavItem to="/student/files" icon={FolderLock}>Ficheiros privados</NavItem>
              <NavItem to="/student/courses" icon={BookOpen}>As minhas disciplinas</NavItem>
            </>
          )}
          {role === "instructor" && (
            <>
              <NavItem to="/instructor/dashboard" icon={LayoutDashboard}>Painel do instrutor</NavItem>
              <NavItem to="/student/calendar" icon={Calendar}>Calendário</NavItem>
              <NavItem to="/instructor/courses" icon={BookOpen}>As minhas disciplinas</NavItem>
            </>
          )}
          {role === "admin" && (
            <>
              <NavItem to="/admin/dashboard" icon={LayoutDashboard}>Painel admin</NavItem>
              <NavItem to="/admin/users" icon={Users}>Utilizadores</NavItem>
              <NavItem to="/admin/courses" icon={BookOpen}>Disciplinas</NavItem>
              <NavItem to="/student/calendar" icon={Calendar}>Calendário</NavItem>
              <NavItem to="/admin/settings" icon={Settings}>Definições</NavItem>
            </>
          )}
        </aside>

        <main className="flex-1 p-6 max-w-[1400px] mx-auto w-full">{children}</main>
      </div>
    </div>
  );
}
