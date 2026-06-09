import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen, ClipboardList, FileCheck2, GraduationCap,
  ChevronRight, Video, Calendar
} from "lucide-react";

export const Route = createFileRoute("/student/dashboard")({
  component: () => <RequireAuth allow={["student"]}><Page /></RequireAuth>,
});

type Course = { id: string; code: string; name: string; description: string | null };

function Page() {
  const { user, profile } = useAuth();
  const [courses, setCourses]         = useState<Course[]>([]);
  const [quizCount, setQuizCount]     = useState(0);
  const [assignCount, setAssignCount] = useState(0);
  const [upcoming, setUpcoming]       = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Disciplinas inscritas
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("course:courses(id, code, name, description)")
        .eq("student_id", user.id);
      const myCourses: Course[] = (enrollments ?? []).map((r: any) => r.course).filter(Boolean);
      setCourses(myCourses);

      const courseIds = myCourses.map((c) => c.id);

      if (courseIds.length > 0) {
        // Testes disponíveis
        const { count: qc } = await supabase
          .from("quizzes")
          .select("id", { count: "exact", head: true })
          .in("course_id", courseIds)
          .or(`closes_at.is.null,closes_at.gt.${new Date().toISOString()}`);
        setQuizCount(qc ?? 0);

        // Trabalhos pendentes (não submetidos)
        const { data: allAssign } = await supabase
          .from("assignments")
          .select("id")
          .in("course_id", courseIds);
        const assignIds = (allAssign ?? []).map((a: any) => a.id);

        if (assignIds.length > 0) {
          const { data: subs } = await supabase
            .from("assignment_submissions")
            .select("assignment_id")
            .eq("student_id", user.id)
            .in("assignment_id", assignIds);
          const submittedIds = new Set((subs ?? []).map((s: any) => s.assignment_id));
          setAssignCount(assignIds.filter((id: string) => !submittedIds.has(id)).length);
        }
      }

      // Próximas aulas (próximos 7 dias)
      const now = new Date().toISOString();
      const week = new Date(Date.now() + 7 * 864e5).toISOString();
      const { data: lessons } = await supabase
        .from("zoom_lessons")
        .select("id, title, starts_at, zoom_url, topic:course_topics(course_id, title, course:courses(name))")
        .gte("starts_at", now)
        .lte("starts_at", week)
        .order("starts_at")
        .limit(4);
      setUpcoming(lessons ?? []);

      setLoading(false);
    })();
  }, [user]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <p className="text-muted-foreground text-sm">A carregar…</p>
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {greeting}, {profile?.full_name?.split(" ")[0] || "estudante"} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-bold">
          {profile?.full_name?.[0]?.toUpperCase() ?? "A"}
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          icon={<BookOpen className="h-5 w-5" />}
          label="Disciplinas"
          value={courses.length}
          color="bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
        />
        <StatCard
          icon={<ClipboardList className="h-5 w-5" />}
          label="Testes abertos"
          value={quizCount}
          color="bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400"
        />
        <StatCard
          icon={<FileCheck2 className="h-5 w-5" />}
          label="Trabalhos por entregar"
          value={assignCount}
          color="bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
        />
      </div>

      {/* Próximas aulas */}
      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Próximas aulas (7 dias)
          </h2>
          <ul className="rounded-lg border bg-card divide-y">
            {upcoming.map((l) => {
              const d = new Date(l.starts_at);
              return (
                <li key={l.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex flex-col items-center justify-center shrink-0">
                    <span className="text-xs font-bold leading-none">{d.getDate()}</span>
                    <span className="text-[10px] leading-none opacity-70">
                      {d.toLocaleString("pt-PT", { month: "short" })}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{l.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                      {l.topic?.course?.name ? ` · ${l.topic.course.name}` : ""}
                    </p>
                  </div>
                  {l.zoom_url && (
                    <a href={l.zoom_url} target="_blank" rel="noreferrer"
                      className="shrink-0 text-xs rounded bg-primary text-primary-foreground px-2.5 py-1.5 flex items-center gap-1">
                      <Video className="h-3 w-3" /> Entrar
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Disciplinas */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary" />
            As minhas disciplinas
          </h2>
          <Link to="/student/courses/" className="text-xs text-primary flex items-center gap-1 hover:underline">
            Ver todas <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {courses.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">
              Ainda não estás inscrito em nenhuma disciplina.
            </p>
            <p className="text-xs text-muted-foreground mt-1">Contacta o administrador.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {courses.slice(0, 6).map((c) => (
              <Link
                key={c.id}
                to="/student/courses/$id"
                params={{ id: c.id }}
                className="group rounded-lg border bg-card p-4 hover:border-primary hover:shadow-sm transition"
              >
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-muted-foreground">{c.code}</p>
                    <h3 className="text-sm font-semibold group-hover:text-primary truncate">{c.name}</h3>
                    {c.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{c.description}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition shrink-0 mt-0.5" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number; color: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-md flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}
