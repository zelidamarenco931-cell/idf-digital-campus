import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Hero, HeroLink, StatTile, greetingNow, todayLong } from "@/components/DashboardUI";
import {
  BookOpen, Users, CalendarClock, ClipboardCheck, ClipboardList, FileCheck2,
  Video, CheckCircle2, Paperclip, Hourglass, Calendar,
} from "lucide-react";

export const Route = createFileRoute("/instructor/dashboard")({
  component: () => <RequireAuth allow={["instructor", "admin"]}><Page /></RequireAuth>,
});

const TZ = "Africa/Maputo";
const fmtDateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString("pt-PT", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }) : "—";

type Course = { id: string; code: string | null; name: string };
type Data = {
  courses: Course[];
  enrollments: { course_id: string; student_id: string }[];
  topics: { id: string; course_id: string }[];
  lessons: { id: string; title: string; starts_at: string; zoom_url: string | null; topic_id: string }[];
  assignments: { id: string; title: string; topic_id: string; due_at: string | null }[];
  quizzes: { id: string; title: string; topic_id: string; closes_at: string | null }[];
  submissions: { id: string; assignment_id: string; student_id: string; submitted_at: string; grade: number | null; feedback: string | null; file_url: string | null; file_path: string | null }[];
  attempts: { quiz_id: string; student_id: string; score: number | null; submitted_at: string | null }[];
  profiles: { id: string; full_name: string | null; email: string | null }[];
};

function Page() {
  const { user, profile, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    let courses: Course[] = [];
    if (isAdmin) {
      const { data, error: e } = await supabase.from("courses").select("id, code, name").order("name");
      if (e) return setError(e.message);
      courses = (data ?? []) as Course[];
    } else {
      const { data, error: e } = await supabase.from("instructor_courses")
        .select("course:courses(id, code, name)").eq("instructor_id", user.id);
      if (e) return setError(e.message);
      courses = (data ?? []).map((x: any) => x.course).filter(Boolean) as Course[];
    }
    const empty: Data = { courses, enrollments: [], topics: [], lessons: [], assignments: [], quizzes: [], submissions: [], attempts: [], profiles: [] };
    if (courses.length === 0) { setD(empty); return; }
    const cids = courses.map((c) => c.id);

    const [en, tp, pr] = await Promise.all([
      supabase.from("enrollments").select("course_id, student_id").in("course_id", cids),
      supabase.from("course_topics").select("id, course_id").in("course_id", cids),
      supabase.from("profiles").select("id, full_name, email"),
    ]);
    const failed1 = [en, tp, pr].find((x) => x.error);
    if (failed1?.error) return setError(failed1.error.message);
    const topics = (tp.data ?? []) as Data["topics"];
    const tids = topics.map((t) => t.id);
    if (tids.length === 0) {
      setD({ ...empty, enrollments: (en.data ?? []) as Data["enrollments"], profiles: (pr.data ?? []) as Data["profiles"] });
      return;
    }
    const [ls, as, qs] = await Promise.all([
      supabase.from("zoom_lessons").select("id, title, starts_at, zoom_url, topic_id").in("topic_id", tids).order("starts_at"),
      supabase.from("assignments").select("id, title, topic_id, due_at").in("topic_id", tids),
      supabase.from("quizzes").select("id, title, topic_id, closes_at").in("topic_id", tids),
    ]);
    const failed2 = [ls, as, qs].find((x) => x.error);
    if (failed2?.error) return setError(failed2.error.message);
    const assignments = (as.data ?? []) as Data["assignments"];
    const quizzes = (qs.data ?? []) as Data["quizzes"];
    const aids = assignments.map((x) => x.id), qids = quizzes.map((x) => x.id);
    const [sb, at] = await Promise.all([
      aids.length ? supabase.from("assignment_submissions").select("id, assignment_id, student_id, submitted_at, grade, feedback, file_url, file_path").in("assignment_id", aids).order("submitted_at", { ascending: false }).limit(200) : Promise.resolve({ data: [], error: null } as any),
      qids.length ? supabase.from("quiz_attempts").select("quiz_id, student_id, score, submitted_at").in("quiz_id", qids).not("submitted_at", "is", null).order("submitted_at", { ascending: false }).limit(10) : Promise.resolve({ data: [], error: null } as any),
    ]);
    const failed3 = [sb, at].find((x: any) => x.error);
    if (failed3?.error) return setError(failed3.error.message);
    setError(null);
    setD({
      courses,
      enrollments: (en.data ?? []) as Data["enrollments"],
      topics,
      lessons: (ls.data ?? []) as Data["lessons"],
      assignments, quizzes,
      submissions: (sb.data ?? []) as Data["submissions"],
      attempts: (at.data ?? []) as Data["attempts"],
      profiles: (pr.data ?? []) as Data["profiles"],
    });
  }, [user, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const v = useMemo(() => {
    if (!d) return null;
    const now = Date.now();
    const nameOf = (id: string) => { const p = d.profiles.find((x) => x.id === id); return p?.full_name || p?.email || "Aluno"; };
    const topicCourse = new Map(d.topics.map((t) => [t.id, t.course_id]));
    const courseName = new Map(d.courses.map((c) => [c.id, c.name]));
    const aById = new Map(d.assignments.map((a) => [a.id, a]));
    const qById = new Map(d.quizzes.map((q) => [q.id, q]));
    const cOf = (topicId: string) => courseName.get(topicCourse.get(topicId) ?? "") ?? "";

    const upcoming = d.lessons.filter((l) => new Date(l.starts_at).getTime() >= now).slice(0, 5)
      .map((l) => ({ ...l, course: cOf(l.topic_id) }));
    const pending = d.submissions.filter((s) => s.grade === null)
      .map((s) => ({ ...s, who: nameOf(s.student_id), title: aById.get(s.assignment_id)?.title ?? "Trabalho", course: cOf(aById.get(s.assignment_id)?.topic_id ?? "") }));
    const deadlines = [
      ...d.assignments.filter((a) => a.due_at && new Date(a.due_at).getTime() >= now).map((a) => ({ id: a.id, kind: "Trabalho", title: a.title, when: a.due_at!, course: cOf(a.topic_id) })),
      ...d.quizzes.filter((q) => q.closes_at && new Date(q.closes_at).getTime() >= now).map((q) => ({ id: q.id, kind: "Teste", title: q.title, when: q.closes_at!, course: cOf(q.topic_id) })),
    ].sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime()).slice(0, 5);

    const rows = d.courses.map((c) => {
      const tids = new Set(d.topics.filter((t) => t.course_id === c.id).map((t) => t.id));
      const aids = new Set(d.assignments.filter((a) => tids.has(a.topic_id)).map((a) => a.id));
      return {
        ...c,
        students: d.enrollments.filter((e) => e.course_id === c.id).length,
        upcoming: d.lessons.filter((l) => tids.has(l.topic_id) && new Date(l.starts_at).getTime() >= now).length,
        quizzes: d.quizzes.filter((q) => tids.has(q.topic_id)).length,
        assignments: aids.size,
        pending: pending.filter((s) => aids.has(s.assignment_id)).length,
      };
    });
    const results = d.attempts.map((a) => ({ ...a, who: nameOf(a.student_id), title: qById.get(a.quiz_id)?.title ?? "Teste" })).slice(0, 5);
    return {
      rows, upcoming, pending, deadlines, results,
      uniqueStudents: new Set(d.enrollments.map((e) => e.student_id)).size,
    };
  }, [d]);

  if (error) return <p className="text-destructive text-sm">Não foi possível carregar o painel: {error}</p>;
  if (!d || !v) return <p className="text-muted-foreground">A carregar…</p>;

  const firstName = profile?.full_name?.split(" ")[0] || "instrutor";

  return (
    <div className="space-y-6">
      <Hero
        eyebrow={isAdmin ? "Administrador · vista de instrutor" : "Instrutor"}
        title={`${greetingNow()}, ${firstName} 👋`}
        subtitle={`${todayLong()} · ${isAdmin ? "Todas as disciplinas." : "O resumo das suas disciplinas."}`}
        initial={(profile?.full_name || profile?.email || "I")[0].toUpperCase()}
        avatarUrl={profile?.avatar_url}
        actions={
          <>
            <HeroLink to="/instructor/courses" solid icon={<BookOpen className="h-4 w-4" />}>As minhas disciplinas</HeroLink>
            <HeroLink to="/student/calendar" icon={<Calendar className="h-4 w-4" />}>Calendário</HeroLink>
          </>
        }
      />

      {d.courses.length === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">
          Ainda não tem disciplinas atribuídas. Peça ao administrador para o atribuir a uma disciplina.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile icon={<BookOpen className="h-5 w-5" />} label="Disciplinas" value={d.courses.length} tone="blue" />
            <StatTile icon={<Users className="h-5 w-5" />} label="Alunos" value={v.uniqueStudents} tone="emerald" />
            <StatTile icon={<ClipboardCheck className="h-5 w-5" />} label="Por corrigir" value={v.pending.length} tone="amber" highlight={v.pending.length > 0} />
            <StatTile icon={<CalendarClock className="h-5 w-5" />} label="Próximas aulas" value={v.upcoming.length} tone="violet" />
          </div>

          <section className="rounded-xl border bg-card shadow-sm">
            <header className="px-5 py-3 border-b flex items-center gap-2 font-semibold text-sm">
              <FileCheck2 className="h-4 w-4" /> Trabalhos por corrigir
            </header>
            {v.pending.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" /> Nada por corrigir.
              </p>
            ) : (
              <ul className="divide-y">
                {v.pending.slice(0, 8).map((s) => <PendingItem key={s.id} s={s} onSaved={load} />)}
              </ul>
            )}
            {v.pending.length > 8 && <p className="px-5 py-2 text-xs text-muted-foreground border-t">E mais {v.pending.length - 8} por corrigir.</p>}
          </section>

          <div className="grid lg:grid-cols-2 gap-6">
            <section className="rounded-xl border bg-card shadow-sm">
              <header className="px-5 py-3 border-b flex items-center gap-2 font-semibold text-sm">
                <Video className="h-4 w-4" /> Próximas aulas
              </header>
              <ul className="divide-y">
                {v.upcoming.map((l) => (
                  <li key={l.id} className="px-5 py-3 text-sm flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{l.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{fmtDateTime(l.starts_at)}{l.course ? ` · ${l.course}` : ""}</p>
                    </div>
                    {l.zoom_url && <a href={l.zoom_url} target="_blank" rel="noreferrer" className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 shrink-0">Abrir Zoom</a>}
                  </li>
                ))}
                {v.upcoming.length === 0 && <li className="px-5 py-6 text-sm text-center text-muted-foreground">Sem aulas agendadas.</li>}
              </ul>
            </section>

            <section className="rounded-xl border bg-card shadow-sm">
              <header className="px-5 py-3 border-b flex items-center gap-2 font-semibold text-sm">
                <Hourglass className="h-4 w-4" /> Prazos a chegar
              </header>
              <ul className="divide-y">
                {v.deadlines.map((x) => (
                  <li key={`${x.kind}-${x.id}`} className="px-5 py-3 text-sm flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{x.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{fmtDateTime(x.when)}{x.course ? ` · ${x.course}` : ""}</p>
                    </div>
                    <span className="text-xs rounded bg-secondary px-2 py-0.5 shrink-0">{x.kind}</span>
                  </li>
                ))}
                {v.deadlines.length === 0 && <li className="px-5 py-6 text-sm text-center text-muted-foreground">Sem prazos próximos.</li>}
              </ul>
            </section>
          </div>

          <section className="space-y-3">
            <h2 className="font-semibold text-sm">As minhas disciplinas</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {v.rows.map((c) => (
                <Link key={c.id} to="/instructor/courses/$id" params={{ id: c.id }}
                  className="rounded-xl border bg-card p-5 shadow-sm hover:border-primary hover:shadow-md transition space-y-3">
                  <div>
                    <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    {c.code && <p className="text-xs text-muted-foreground">{c.code}</p>}
                    <h3 className="font-semibold">{c.name}</h3>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between"><dt>Alunos</dt><dd className="text-foreground">{c.students}</dd></div>
                    <div className="flex justify-between"><dt>Aulas futuras</dt><dd className="text-foreground">{c.upcoming}</dd></div>
                    <div className="flex justify-between"><dt>Testes</dt><dd className="text-foreground">{c.quizzes}</dd></div>
                    <div className="flex justify-between"><dt>Trabalhos</dt><dd className="text-foreground">{c.assignments}</dd></div>
                  </dl>
                  {c.pending > 0 && <p className="text-xs rounded bg-amber-100 text-amber-800 px-2 py-1 inline-block">{c.pending} por corrigir</p>}
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-xl border bg-card shadow-sm">
            <header className="px-5 py-3 border-b flex items-center gap-2 font-semibold text-sm">
              <ClipboardList className="h-4 w-4" /> Resultados recentes de testes
            </header>
            <ul className="divide-y">
              {v.results.map((r, i) => (
                <li key={i} className="px-5 py-3 text-sm flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.who} · {fmtDateTime(r.submitted_at)}</p>
                  </div>
                  <span className="text-sm font-semibold shrink-0">{r.score ?? "—"}/20</span>
                </li>
              ))}
              {v.results.length === 0 && <li className="px-5 py-6 text-sm text-center text-muted-foreground">Ainda sem testes submetidos.</li>}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function PendingItem({ s, onSaved }: { s: any; onSaved: () => void }) {
  const [grade, setGrade] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  const openFile = async () => {
    if (s.file_path) {
      const { data, error } = await supabase.storage.from("assignment-submissions").createSignedUrl(s.file_path, 60 * 10);
      if (error || !data?.signedUrl) return toast.error(error?.message ?? "Não foi possível abrir o ficheiro.");
      window.open(data.signedUrl, "_blank", "noreferrer");
    } else if (s.file_url) {
      window.open(s.file_url, "_blank", "noreferrer");
    }
  };

  const save = async () => {
    const g = Number(grade);
    if (grade === "" || !(g >= 0 && g <= 20)) return toast.error("Indique uma nota entre 0 e 20.");
    setSaving(true);
    const { error } = await supabase.from("assignment_submissions")
      .update({ grade: g, feedback: feedback.trim() || null }).eq("id", s.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Nota guardada.");
    onSaved();
  };

  return (
    <li className="px-5 py-4 space-y-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{s.title}</p>
          <p className="text-xs text-muted-foreground">{s.who} · {fmtDateTime(s.submitted_at)}{s.course ? ` · ${s.course}` : ""}</p>
        </div>
        {(s.file_path || s.file_url) && (
          <button type="button" onClick={openFile} className="text-xs inline-flex items-center gap-1 rounded border px-2.5 py-1.5 hover:bg-secondary shrink-0">
            <Paperclip className="h-3.5 w-3.5" /> Abrir ficheiro
          </button>
        )}
      </div>
      <div className="grid sm:grid-cols-[110px_1fr_auto] gap-2">
        <input type="number" min="0" max="20" step="0.01" value={grade} onChange={(e) => setGrade(e.target.value)}
          placeholder="Nota 0–20" className="rounded border px-2 py-1.5 bg-background" />
        <input value={feedback} onChange={(e) => setFeedback(e.target.value)}
          placeholder="Comentário (opcional)" className="rounded border px-2 py-1.5 bg-background" />
        <button type="button" onClick={save} disabled={saving}
          className="rounded bg-primary text-primary-foreground px-4 py-1.5 disabled:opacity-50">{saving ? "A guardar…" : "Guardar nota"}</button>
      </div>
    </li>
  );
}
