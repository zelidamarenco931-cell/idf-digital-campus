import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, MessageSquare, LogOut, LayoutDashboard, Calendar, FolderLock, BookOpen, Home, Users, Settings, Menu, X } from "lucide-react";
import { useAuth, primaryRole, type Role } from "@/lib/auth";
import { useEffect, useState, type ReactNode } from "react";
import logo from "@/assets/logo.png";

function NavItem({ to, icon: Icon, children, onNavigate }: { to: string; icon: any; children: ReactNode; onNavigate?: () => void }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const active = path === to || path.startsWith(to + "/");
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors border-l-2 ${
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

function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  return (
    <>
      {role === "student" && (
        <>
          <NavItem to="/student/dashboard" icon={LayoutDashboard} onNavigate={onNavigate}>Painel do utilizador</NavItem>
          <NavItem to="/" icon={Home} onNavigate={onNavigate}>Página inicial</NavItem>
          <NavItem to="/student/calendar" icon={Calendar} onNavigate={onNavigate}>Calendário</NavItem>
          <NavItem to="/student/files" icon={FolderLock} onNavigate={onNavigate}>Ficheiros privados</NavItem>
          <NavItem to="/student/courses" icon={BookOpen} onNavigate={onNavigate}>As minhas disciplinas</NavItem>
        </>
      )}
      {role === "instructor" && (
        <>
          <NavItem to="/instructor/dashboard" icon={LayoutDashboard} onNavigate={onNavigate}>Painel do instrutor</NavItem>
          <NavItem to="/instructor/calendar" icon={Calendar} onNavigate={onNavigate}>Calendário e agenda</NavItem>
          <NavItem to="/instructor/courses" icon={BookOpen} onNavigate={onNavigate}>As minhas disciplinas</NavItem>
        </>
      )}
      {role === "admin" && (
        <>
          <NavItem to="/admin/dashboard" icon={LayoutDashboard} onNavigate={onNavigate}>Painel admin</NavItem>
          <NavItem to="/admin/users" icon={Users} onNavigate={onNavigate}>Utilizadores</NavItem>
          <NavItem to="/admin/courses" icon={BookOpen} onNavigate={onNavigate}>Disciplinas</NavItem>
          <NavItem to="/instructor/calendar" icon={Calendar} onNavigate={onNavigate}>Calendário e agenda</NavItem>
          <NavItem to="/instructor/dashboard" icon={LayoutDashboard} onNavigate={onNavigate}>Vista de instrutor</NavItem>
          <NavItem to="/admin/settings" icon={Settings} onNavigate={onNavigate}>Definições</NavItem>
        </>
      )}
    </>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, roles, signOut } = useAuth();
  const navigate = useNavigate();
  const role: Role = primaryRole(roles);
  const [menuOpen, setMenuOpen] = useState(false);
  const path = useRouterState({ select: (r) => r.location.pathname });

  // Fecha o menu do telemóvel ao mudar de página
  useEffect(() => { setMenuOpen(false); }, [path]);

  const initials = (profile?.full_name || profile?.email || "U")
    .split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Topbar */}
      <header className="h-14 bg-topbar text-topbar-foreground flex items-center px-3 sm:px-4 gap-2 sm:gap-4 shadow-sm sticky top-0 z-40">
        <button
          className="md:hidden p-2 hover:bg-white/10 rounded-md"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <Link to="/" className="flex items-center gap-2 font-semibold min-w-0">
          <img src={logo} alt="IDF" className="h-8 w-8 rounded-sm bg-white object-contain p-0.5 shrink-0" />
          <span className="hidden sm:inline truncate">IDF — Instituto Digital de Formação</span>
          <span className="sm:hidden">IDF</span>
        </Link>
        <div className="flex-1" />
        <button className="hidden sm:block p-2 hover:bg-white/10 rounded-md" aria-label="Mensagens">
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
        {/* Menu lateral (ecrã médio e grande) */}
        <aside className="w-60 bg-sidebar border-r border-sidebar-border py-3 hidden md:block shrink-0">
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Navegação
          </div>
          <NavLinks role={role} />
        </aside>

        {/* Menu do telemóvel */}
        {menuOpen && (
          <>
            <div className="fixed inset-0 top-14 z-30 bg-black/40 md:hidden" onClick={() => setMenuOpen(false)} />
            <aside className="fixed left-0 top-14 bottom-0 z-40 w-64 bg-sidebar border-r border-sidebar-border py-3 overflow-y-auto md:hidden">
              <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Navegação
              </div>
              <NavLinks role={role} onNavigate={() => setMenuOpen(false)} />
            </aside>
          </>
        )}

        <main className="flex-1 min-w-0 p-4 md:p-6 max-w-[1400px] mx-auto w-full">{children}</main>
      </div>
    </div>
  );
}
