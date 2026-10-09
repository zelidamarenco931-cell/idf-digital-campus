import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell, MessageSquare, LogOut, LayoutDashboard, Calendar, FolderLock, BookOpen,
  Home, Users, Settings, Menu, X, GraduationCap,
} from "lucide-react";
import { useAuth, primaryRole, type Role } from "@/lib/auth";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.png";

type CourseLink = { id: string; code: string; name: string };

function NavItem({
  to, icon: Icon, children, onNavigate,
}: { to: string; icon: any; children: ReactNode; onNavigate?: () => void }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const active = path === to || path.startsWith(to + "/");
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors border-l-2 ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground border-sidebar-primary font-medium"
          : "text-sidebar-foreground border-transparent hover:bg-sidebar-accent/50"
      }`}
    >
      <Icon className="h-4 w-4 text-primary shrink-0" />
      <span>{children}</span>
    </Link>
  );
}

function SidebarNav({
  role, courses, onNavigate,
}: { role: Role; courses: CourseLink[]; onNavigate?: () => void }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  return (
    <nav className="py-1">
      {role === "student" && (
        <>
          <NavItem to="/student/dashboard" icon={LayoutDashboard} onNavigate={onNavigate}>Painel do utilizador</NavItem>
          <NavItem to="/" icon={Home} onNavigate={onNavigate}>Página inicial do site</NavItem>
          <NavItem to="/student/calendar" icon={Calendar} onNavigate={onNavigate}>Calendário</NavItem>
          <NavItem to="/student/files" icon={FolderLock} onNavigate={onNavigate}>Ficheiros privados</NavItem>

          <NavItem to="/student/courses" icon={GraduationCap} onNavigate={onNavigate}>Minhas disciplinas</NavItem>
          {courses.map((c) => {
            const active = path.startsWith(`/student/courses/${c.id}`);
            return (
              <Link
                key={c.id}
                to="/student/courses/$id"
                params={{ id: c.id }}
                onClick={onNavigate}
                className={`flex items-start gap-3 pl-5 pr-4 py-3 text-sm border-t border-sidebar-border/60 transition-colors ${
                  active ? "bg-sidebar-accent font-medium" : "hover:bg-sidebar-accent/50"
                }`}
              >
                <GraduationCap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span className="leading-snug">{c.name}</span>
              </Link>
            );
          })}
        </>
      )}
      {role === "instructor" && (
        <>
          <NavItem to="/instructor/dashboard" icon={LayoutDashboard} onNavigate={onNavigate}>Painel do instrutor</NavItem>
          <NavItem to="/student/calendar" icon={Calendar} onNavigate={onNavigate}>Calendário</NavItem>
          <NavItem to="/instructor/courses" icon={BookOpen} onNavigate={onNavigate}>As minhas disciplinas</NavItem>
        </>
      )}
      {role === "admin" && (
        <>
          <NavItem to="/admin/dashboard" icon={LayoutDashboard} onNavigate={onNavigate}>Painel admin</NavItem>
          <NavItem to="/admin/users" icon={Users} onNavigate={onNavigate}>Utilizadores</NavItem>
          <NavItem to="/admin/courses" icon={BookOpen} onNavigate={onNavigate}>Disciplinas</NavItem>
          <NavItem to="/student/calendar" icon={Calendar} onNavigate={onNavigate}>Calendário</NavItem>
          <NavItem to="/admin/settings" icon={Settings} onNavigate={onNavigate}>Definições</NavItem>
        </>
      )}
    </nav>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, profile, roles, signOut } = useAuth();
  const navigate = useNavigate();
  const role: Role = primaryRole(roles);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [courses, setCourses] = useState<CourseLink[]>([]);

  const initials = (profile?.full_name || profile?.email || "U")
    .split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  // Disciplinas do aluno para o menu lateral ("Minhas disciplinas")
  useEffect(() => {
    if (!user || role !== "student") { setCourses([]); return; }
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("course:courses(id, code, name)")
        .eq("student_id", user.id);
      const list: CourseLink[] = (data ?? []).map((r: any) => r.course).filter(Boolean);
      list.sort((a, b) => a.name.localeCompare(b.name, "pt"));
      setCourses(list);
    })();
  }, [user, role]);

  // Bloqueia o scroll da página enquanto o menu está aberto no telemóvel
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Topbar */}
      <header className="h-14 bg-topbar text-topbar-foreground flex items-center px-3 sm:px-4 gap-2 sm:gap-4 shadow-sm sticky top-0 z-30">
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-2 hover:bg-white/10 rounded-md md:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link to="/" className="flex items-center gap-2 font-semibold min-w-0">
          <img src={logo} alt="IDF" className="h-8 w-8 rounded-sm bg-white object-contain p-0.5 shrink-0" />
          <span className="truncate hidden sm:inline">IDF — Instituto Digital de Formação</span>
          <span className="truncate sm:hidden">IDF</span>
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
        {/* Sidebar (computador) */}
        <aside className="w-64 shrink-0 bg-sidebar border-r border-sidebar-border hidden md:block">
          <SidebarNav role={role} courses={courses} />
        </aside>

        {/* Menu lateral deslizante (telemóvel), como no Moodle */}
        {drawerOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
            <aside className="absolute left-0 top-0 bottom-0 w-[80%] max-w-sm bg-sidebar shadow-xl overflow-y-auto">
              <div className="h-14 flex items-center justify-between px-4 border-b border-sidebar-border">
                <span className="font-semibold">Menu</span>
                <button onClick={() => setDrawerOpen(false)} className="p-2 rounded-md hover:bg-secondary" aria-label="Fechar menu">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <SidebarNav role={role} courses={courses} onNavigate={() => setDrawerOpen(false)} />
            </aside>
          </div>
        )}

        <main className="flex-1 min-w-0 p-4 sm:p-6 max-w-[1400px] mx-auto w-full">{children}</main>
      </div>
    </div>
  );
}
