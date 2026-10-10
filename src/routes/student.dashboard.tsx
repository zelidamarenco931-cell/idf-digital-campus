import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Hero, HeroLink, StatTile, greetingNow, todayLong } from "@/components/DashboardUI";
import {
  BookOpen, ClipboardList, FileCheck2, GraduationCap,
  ChevronRight, Video, Calendar, FolderLock,
} from "lucide-react";

export const Route = createFileRoute("/student/dashboard")({
  component: () => <RequireAuth allow={["student"]}><Page /></RequireAuth>,
});

type Course = { id: string; code: string; name: string; description: string | null };

// Fuso horário da instituição (Moçambique, UTC+2).
const APP_TZ = "Africa/Maputo";

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
        // Quizzes e trabalhos ligam-se à disciplina através dos tópicos (topic_id)
        const { data: topics } = await supabase
          .from("course_topics")
          .select("id")
          .in("course_id", courseIds);
        const topicIds = (topics ?? []).map((t: any) => t.id);

        if (topicIds.length > 0) {
          // Testes disponíveis
          const { count: qc } = await supabase
            .from("quizzes")
            .select("id", { count: "exact", head: true })
            .in("topic_id", topicIds)
            .or(`closes_at.is.null,closes_at.gt.${new Date().toISOString()}`);
          setQuizCount(qc ?? 0);

          // Trabalhos pendentes (não submetidos)
          const { data: allAssign } = await supabase
            .from("assignments")
            .select("id")
            .in("topic_id", topicIds);
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

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <p className="text-muted-foreground text-sm">A carregar…</p>
    </div>
  );

  const firstName = profile?.full_name?.split(" ")[0] || "estudante";

  return (
    <div className="space-y-6 max-w-5xl">
      <Hero
        eyebrow="Aluno"
        title={`${greetingNow()}, ${firstName} 👋`}
        subtitle={todayLong()}
        initial={profile?.full_name?.[0]?.toUpperCase() ?? "A"}
        avatarUrl={profile?.avatar_url}
        actions={
          <>
            <HeroLink to="/student/courses" solid icon={<GraduationCap className="h-4 w-4" />}>As minhas disciplinas</HeroLink>
            <HeroLink to="/student/calendar" icon={<Calendar className="h-4 w-4" />}>Calendário</HeroLink>
            <HeroLink to="/student/files" icon={<FolderLock className="h-4 w-4" />}>Ficheiros</HeroLink>
          </>
        }
      />

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-3">
        <StatTile icon={<BookOpen className="h-5 w-5" />} label="Disciplinas" value={courses.length} tone="blue" />
        <StatTile icon={<ClipboardList className="h-5 w-5" />} label="Testes abertos" value={quizCount} tone="violet" />
        <StatTile icon={<FileCheck2 className="h-5 w-5" />} label="Trabalhos por entregar" value={assignCount} tone="amber" highlight={assignCount > 0} />
      </div>

      {/* Próximas aulas */}
      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Próximas aulas (7 dias)
          </h2>
          <ul className="rounded-xl border bg-card shadow-sm divide-y">
            {upcoming.map((l) => {
              const d = new Date(l.starts_at);
              return (
                <li key={l.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="h-11 w-11 rounded-lg bg-primary/10 text-primary flex flex-col items-center justify-center shrink-0">
                    <span className="text-sm font-bold leading-none">
                      {d.toLocaleString("pt-PT", { timeZone: APP_TZ, day: "numeric" })}
                    </span>
                    <span className="text-[10px] leading-none opacity-70 mt-0.5">
                      {d.toLocaleString("pt-PT", { timeZone: APP_TZ, month: "short" })}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{l.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.toLocaleTimeString("pt-PT", { timeZone: APP_TZ, hour: "2-digit", minute: "2-digit" })}
                      {l.topic?.course?.name ? ` · ${l.topic.course.name}` : ""}
                    </p>
                  </div>
                  {l.zoom_url && (
                    <a href={l.zoom_url} target="_blank" rel="noreferrer"
                      className="shrink-0 text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 flex items-center gap-1">
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
          <div className="rounded-xl border border-dashed p-8 text-center">
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
                className="group rounded-xl border bg-card p-4 shadow-sm hover:border-primary hover:shadow-md transition"
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
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
