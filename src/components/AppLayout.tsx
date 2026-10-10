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

const ROLE_LABEL: Record<string, string> = { admin: "Administrador", instructor: "Instrutor", student: "Aluno" };

function NavItem({
  to, icon: Icon, children, onNavigate,
}: { to: string; icon: any; children: ReactNode; onNavigate?: () => void }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const active = path === to || path.startsWith(to + "/");
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`mx-2 my-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
        active
          ? "bg-primary text-primary-foreground font-medium shadow-sm"
          : "text-sidebar-foreground hover:bg-sidebar-accent/60"
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${active ? "" : "text-primary"}`} />
      <span>{children}</span>
    </Link>
  );
}

function CoursesList({
  title, courses, base, onNavigate,
}: { title: string; courses: CourseLink[]; base: "/student/courses" | "/instructor/courses"; onNavigate?: () => void }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  return (
    <>
      <NavItem to={base} icon={GraduationCap} onNavigate={onNavigate}>{title}</NavItem>
      <div className="mx-2 mb-1 ml-5 border-l border-sidebar-border/70 pl-2">
        {courses.map((c) => {
          const active = path.startsWith(`${base}/${c.id}`);
          return (
            <Link
              key={c.id}
              to={`${base}/$id` as any}
              params={{ id: c.id } as any}
              onClick={onNavigate}
              className={`flex items-start gap-2 rounded-md px-2.5 py-2 text-[13px] transition-colors ${
                active ? "bg-sidebar-accent font-medium" : "hover:bg-sidebar-accent/50"
              }`}
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span className="leading-snug">{c.name}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}

function SidebarNav({
  role, courses, onNavigate,
}: { role: Role; courses: CourseLink[]; onNavigate?: () => void }) {
  return (
    <nav className="py-2">
      {role === "student" && (
        <>
          <NavItem to="/student/dashboard" icon={LayoutDashboard} onNavigate={onNavigate}>Painel do utilizador</NavItem>
          <NavItem to="/" icon={Home} onNavigate={onNavigate}>Página inicial do site</NavItem>
          <NavItem to="/student/calendar" icon={Calendar} onNavigate={onNavigate}>Calendário</NavItem>
          <NavItem to="/student/files" icon={FolderLock} onNavigate={onNavigate}>Ficheiros privados</NavItem>
          <CoursesList title="Minhas disciplinas" courses={courses} base="/student/courses" onNavigate={onNavigate} />
        </>
      )}
      {role === "instructor" && (
        <>
          <NavItem to="/instructor/dashboard" icon={LayoutDashboard} onNavigate={onNavigate}>Painel do instrutor</NavItem>
          <NavItem to="/" icon={Home} onNavigate={onNavigate}>Página inicial do site</NavItem>
          <NavItem to="/student/calendar" icon={Calendar} onNavigate={onNavigate}>Calendário</NavItem>
          <CoursesList title="As minhas disciplinas" courses={courses} base="/instructor/courses" onNavigate={onNavigate} />
        </>
      )}
      {role === "admin" && (
        <>
          <NavItem to="/admin/dashboard" icon={LayoutDashboard} onNavigate={onNavigate}>Painel admin</NavItem>
          <NavItem to="/" icon={Home} onNavigate={onNavigate}>Página inicial do site</NavItem>
          <NavItem to="/admin/users" icon={Users} onNavigate={onNavigate}>Utilizadores</NavItem>
          <NavItem to="/admin/courses" icon={BookOpen} onNavigate={onNavigate}>Disciplinas</NavItem>
          <NavItem to="/student/calendar" icon={Calendar} onNavigate={onNavigate}>Calendário</NavItem>
          <NavItem to="/admin/settings" icon={Settings} onNavigate={onNavigate}>Definições</NavItem>
        </>
      )}
    </nav>
  );
}

function UserCard({ name, email, role, avatarUrl, initials }: {
  name: string; email?: string | null; role: string; avatarUrl?: string | null; initials: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-4 bg-gradient-to-br from-primary to-primary/75 text-primary-foreground">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover ring-2 ring-white/40" />
      ) : (
        <div className="h-11 w-11 rounded-full bg-white/20 ring-2 ring-white/40 flex items-center justify-center font-semibold">
          {initials}
        </div>
      )}
      <div className="min-w-0">
        <p className="font-semibold truncate">{name}</p>
        <p className="text-xs opacity-85 truncate">{ROLE_LABEL[role] ?? role}{email ? ` · ${email}` : ""}</p>
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, profile, roles, signOut } = useAuth();
  const navigate = useNavigate();
  const role: Role = primaryRole(roles);
  const [drawerOpen, setDrawerOpen] = useState(false);       // telemóvel
  const [sidebarOpen, setSidebarOpen] = useState(true);       // computador
  const [courses, setCourses] = useState<CourseLink[]>([]);

  const displayName = profile?.full_name || profile?.email || "Utilizador";
  const initials = displayName.split(" ").map((s: string) => s[0]).join("").slice(0, 2).toUpperCase();

  // Disciplinas para o menu lateral ("Minhas disciplinas"), para aluno e instrutor
  useEffect(() => {
    if (!user || (role !== "student" && role !== "instructor")) { setCourses([]); return; }
    (async () => {
      const q = role === "student"
        ? supabase.from("enrollments").select("course:courses(id, code, name)").eq("student_id", user.id)
        : supabase.from("instructor_courses").select("course:courses(id, code, name)").eq("instructor_id", user.id);
      const { data } = await q;
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

  const onMenuClick = () => {
    // No telemóvel abre a gaveta; no computador mostra/esconde a barra lateral
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
      setSidebarOpen((v) => !v);
    } else {
      setDrawerOpen(true);
    }
  };

  const doSignOut = async () => { await signOut(); navigate({ to: "/login" }); };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Topbar */}
      <header className="h-14 bg-topbar text-topbar-foreground flex items-center px-3 sm:px-4 gap-2 sm:gap-4 shadow-sm sticky top-0 z-30">
        <button
          onClick={onMenuClick}
          className="p-2 hover:bg-white/10 rounded-md"
          aria-label="Abrir menu"
        >
          <Menu className="h-6 w-6" />
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
            <span className="text-sm font-medium">{displayName}</span>
            <span className="text-[11px] uppercase tracking-wide opacity-80">{role}</span>
          </div>
        </div>
        <button onClick={doSignOut} className="p-2 hover:bg-white/10 rounded-md" aria-label="Sair">
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <div className="flex flex-1">
        {/* Sidebar (computador) — os três traços mostram/escondem */}
        {sidebarOpen && (
          <aside className="w-64 shrink-0 bg-sidebar border-r border-sidebar-border hidden md:block">
            <SidebarNav role={role} courses={courses} />
          </aside>
        )}

        {/* Menu lateral deslizante (telemóvel), como no Moodle */}
        {drawerOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
            <aside className="absolute left-0 top-0 bottom-0 w-[82%] max-w-sm bg-sidebar shadow-2xl overflow-y-auto flex flex-col">
              <div className="relative">
                <UserCard name={displayName} email={profile?.email} role={role} avatarUrl={profile?.avatar_url} initials={initials} />
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="absolute right-2 top-2 p-2 rounded-md hover:bg-white/15 text-primary-foreground"
                  aria-label="Fechar menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1">
                <SidebarNav role={role} courses={courses} onNavigate={() => setDrawerOpen(false)} />
              </div>
              <button
                onClick={doSignOut}
                className="m-3 flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm hover:bg-sidebar-accent/60"
              >
                <LogOut className="h-4 w-4" /> Sair
              </button>
            </aside>
          </div>
        )}

        <main className="flex-1 min-w-0 p-4 sm:p-6 max-w-[1400px] mx-auto w-full">{children}</main>
      </div>
    </div>
  );
}
