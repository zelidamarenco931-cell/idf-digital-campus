import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard, BookOpen, Calendar, FolderLock,
  LogOut, Menu, X, ChevronRight, GraduationCap, Bell
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/student")({
  component: () => <RequireAuth allow={["student", "instructor", "admin"]}><StudentLayout /></RequireAuth>,
});

const NAV = [
  { to: "/student/dashboard",  label: "Painel",        icon: LayoutDashboard },
  { to: "/student/courses/",   label: "Disciplinas",   icon: BookOpen },
  { to: "/student/calendar",   label: "Calendário",    icon: Calendar },
  { to: "/student/files",      label: "Ficheiros",     icon: FolderLock },
];

function StudentLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Topbar ── */}
      <header className="h-14 border-b bg-card flex items-center px-4 gap-3 sticky top-0 z-40">
        <button
          onClick={() => setOpen(!open)}
          className="lg:hidden p-1.5 rounded-md hover:bg-secondary transition"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {/* Logo */}
        <Link to="/student/dashboard" className="flex items-center gap-2 font-bold text-primary select-none">
          <GraduationCap className="h-6 w-6" />
          <span className="text-sm font-extrabold tracking-wide">IDF</span>
          <span className="hidden sm:inline text-xs font-normal text-muted-foreground">Digital Campus</span>
        </Link>

        <div className="flex-1" />

        {/* Notifications placeholder */}
        <button className="relative p-1.5 rounded-md hover:bg-secondary transition">
          <Bell className="h-5 w-5 text-muted-foreground" />
        </button>

        {/* Avatar + name */}
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
            {profile?.full_name?.[0]?.toUpperCase() ?? "A"}
          </div>
          <span className="hidden sm:block text-sm font-medium truncate max-w-32">
            {profile?.full_name ?? "Aluno"}
          </span>
        </div>

        <button
          onClick={handleSignOut}
          className="p-1.5 rounded-md hover:bg-secondary transition text-muted-foreground"
          title="Terminar sessão"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar (desktop) ── */}
        <aside className="hidden lg:flex w-56 border-r bg-card flex-col py-4 gap-1 shrink-0">
          <SidebarContent pathname={pathname} onClose={() => {}} />
        </aside>

        {/* ── Sidebar (mobile overlay) ── */}
        {open && (
          <>
            <div
              className="fixed inset-0 z-30 bg-black/40 lg:hidden"
              onClick={() => setOpen(false)}
            />
            <aside className="fixed left-0 top-14 bottom-0 z-40 w-56 border-r bg-card flex flex-col py-4 gap-1 lg:hidden">
              <SidebarContent pathname={pathname} onClose={() => setOpen(false)} />
            </aside>
          </>
        )}

        {/* ── Main content ── */}
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarContent({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  return (
    <>
      <p className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Menu
      </p>
      {NAV.map(({ to, label, icon: Icon }) => {
        const active = pathname === to || (to !== "/student/dashboard" && pathname.startsWith(to.replace(/\/$/, "")));
        return (
          <Link
            key={to}
            to={to}
            onClick={onClose}
            className={`mx-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition
              ${active
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-secondary"
              }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{label}</span>
            {active && <ChevronRight className="h-3 w-3 opacity-60" />}
          </Link>
        );
      })}
    </>
  );
}
