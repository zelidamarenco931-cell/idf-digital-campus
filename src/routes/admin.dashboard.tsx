import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Users, BookOpen, GraduationCap, UserCog, ShieldCheck, ClipboardCheck,
  ClipboardList, AlertTriangle, CalendarClock, UserPlus, Settings, CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/admin/dashboard")({
  component: () => <RequireAuth allow={["admin"]}><Page /></RequireAuth>,
});

const TZ = "Africa/Maputo";
const fmtDateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString("pt-PT", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }) : "—";
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("pt-PT", { timeZone: TZ }) : "—";

type Data = {
  profiles: { id: string; full_name: string | null; email: string | null; created_at: string }[];
  roles: { user_id: string; role: string }[];
  courses: { id: string; code: string | null; name: string }[];
  enrollments: { course_id: string; student_id: string }[];
  instructorCourses: { course_id: string; instructor_id: string }[];
  lessons: { id: string; title: string; starts_at: string; topic_id: string }[];
  topics: { id: string; course_id: string }[];
  quizzes: number;
  assignments: { id: string; title: string }[];
  submissions: { id: string; assignment_id: string; student_id: string; submitted_at: string; grade: number | null }[];
};

function Page() {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const nowIso = new Date().toISOString();
      const [p, r, c, e, ic, l, t, q, a, s] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, created_at").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("courses").select("id, code, name").order("name"),
        supabase.from("enrollments").select("course_id, student_id"),
        supabase.from("instructor_courses").select("course_id, instructor_id"),
        supabase.from("zoom_lessons").select("id, title, starts_at, topic_id").gte("starts_at", nowIso).order("starts_at").limit(5),
        supabase.from("course_topics").select("id, course_id"),
        supabase.from("quizzes").select("*", { count: "exact", head: true }),
        supabase.from("assignments").select("id, title"),
        supabase.from("assignment_submissions").select("id, assignment_id, student_id, submitted_at, grade").order("submitted_at", { ascending: false }).limit(500),
      ]);
      const failed = [p, r, c, e, ic, l, t, q, a, s].find((x) => x.error);
      if (failed?.error) { setError(failed.error.message); return; }
      setD({
        profiles: (p.data ?? []) as Data["profiles"],
        roles: (r.data ?? []) as Data["roles"],
        courses: (c.data ?? []) as Data["courses"],
        enrollments: (e.data ?? []) as Data["enrollments"],
        instructorCourses: (ic.data ?? []) as Data["instructorCourses"],
        lessons: (l.data ?? []) as Data["lessons"],
        topics: (t.data ?? []) as Data["topics"],
        quizzes: q.count ?? 0,
        assignments: (a.data ?? []) as Data["assignments"],
        submissions: (s.data ?? []) as Data["submissions"],
      });
    })();
  }, []);

  const v = useMemo(() => {
    if (!d) return null;
    const rolesOf = (uid: string) => d.roles.filter((r) => r.user_id === uid).map((r) => r.role);
    const idsWith = (role: string) => new Set(d.roles.filter((r) => r.role === role).map((r) => r.user_id));
    const admins = idsWith("admin"), instructors = idsWith("instructor"), students = idsWith("student");
    const profileById = new Map(d.profiles.map((p) => [p.id, p]));
    const nameOf = (uid: string) => profileById.get(uid)?.full_name || profileById.get(uid)?.email || "—";
    const courseById = new Map(d.courses.map((c) => [c.id, c]));
    const topicCourse = new Map(d.topics.map((t) => [t.id, t.course_id]));
    const assignmentTitle = new Map(d.assignments.map((x) => [x.id, x.title]));

    const courseRows = d.courses.map((c) => {
      const nStudents = d.enrollments.filter((x) => x.course_id === c.id).length;
      const teachers = d.instructorCourses.filter((x) => x.course_id === c.id).map((x) => nameOf(x.instructor_id));
      return { ...c, nStudents, teachers };
    });

    const enrolledIds = new Set(d.enrollments.map((x) => x.student_id));
    const teachingIds = new Set(d.instructorCourses.map((x) => x.instructor_id));
    const studentsWithoutCourse = [...students].filter((id) => !enrolledIds.has(id) && !admins.has(id) && !instructors.has(id));
    const instructorsWithoutCourse = [...instructors].filter((id) => !teachingIds.has(id));
    const coursesWithoutTeacher = courseRows.filter((c) => c.teachers.length === 0);
    const coursesWithoutStudents = courseRows.filter((c) => c.nStudents === 0);
    const pending = d.submissions.filter((s) => s.grade === null);

    const alerts: { text: string; to: string }[] = [];
    if (coursesWithoutTeacher.length) alerts.push({ text: `${coursesWithoutTeacher.length} disciplina(s) sem instrutor: ${coursesWithoutTeacher.map((c) => c.name).join(", ")}`, to: "/admin/courses" });
    if (coursesWithoutStudents.length) alerts.push({ text: `${coursesWithoutStudents.length} disciplina(s) sem alunos inscritos`, to: "/admin/courses" });
    if (studentsWithoutCourse.length) alerts.push({ text: `${studentsWithoutCourse.length} aluno(s) sem nenhuma disciplina: ${studentsWithoutCourse.map(nameOf).join(", ")}`, to: "/admin/courses" });
    if (instructorsWithoutCourse.length) alerts.push({ text: `${instructorsWithoutCourse.length} instrutor(es) sem disciplina atribuída: ${instructorsWithoutCourse.map(nameOf).join(", ")}`, to: "/admin/courses" });
    if (pending.length) alerts.push({ text: `${pending.length} trabalho(s) entregue(s) por corrigir`, to: "/admin/courses" });

    return {
      nUsers: d.profiles.length, nAdmins: admins.size, nInstructors: instructors.size, nStudents: students.size,
      courseRows, pendingCount: pending.length, alerts,
      recentUsers: d.profiles.slice(0, 5).map((p) => ({ ...p, roles: rolesOf(p.id) })),
      recentSubs: d.submissions.slice(0, 5).map((s) => ({ ...s, who: nameOf(s.student_id), title: assignmentTitle.get(s.assignment_id) ?? "Trabalho" })),
      upcoming: d.lessons.map((l) => {
        const c = courseById.get(topicCourse.get(l.topic_id) ?? "");
        return { ...l, course: c?.name ?? "" };
      }),
    };
  }, [d]);

  if (error) return <p className="text-destructive text-sm">Não foi possível carregar o painel: {error}</p>;
  if (!d || !v) return <p className="text-muted-foreground">A carregar…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Painel do administrador</h1>
          <p className="text-sm text-muted-foreground">Visão geral da plataforma IDF Digital Campus</p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/users" className="inline-flex items-center gap-2 rounded bg-primary text-primary-foreground px-3 py-2 text-sm">
            <UserPlus className="h-4 w-4" /> Novo utilizador
          </Link>
          <Link to="/admin/courses" className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-secondary">
            <BookOpen className="h-4 w-4" /> Nova disciplina
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={<Users className="h-4 w-4" />} label="Utilizadores" value={v.nUsers} />
        <Stat icon={<GraduationCap className="h-4 w-4" />} label="Alunos" value={v.nStudents} />
        <Stat icon={<UserCog className="h-4 w-4" />} label="Instrutores" value={v.nInstructors} />
        <Stat icon={<ShieldCheck className="h-4 w-4" />} label="Administradores" value={v.nAdmins} />
        <Stat icon={<BookOpen className="h-4 w-4" />} label="Disciplinas" value={d.courses.length} />
        <Stat icon={<Users className="h-4 w-4" />} label="Inscrições" value={d.enrollments.length} />
        <Stat icon={<ClipboardList className="h-4 w-4" />} label="Testes" value={d.quizzes} />
        <Stat icon={<ClipboardCheck className="h-4 w-4" />} label="Por corrigir" value={v.pendingCount} highlight={v.pendingCount > 0} />
      </div>

      <section className="rounded-lg border bg-card">
        <header className="px-5 py-3 border-b flex items-center gap-2 font-semibold text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-500" /> Requer atenção
        </header>
        {v.alerts.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" /> Tudo em ordem.
          </p>
        ) : (
          <ul className="divide-y">
            {v.alerts.map((a, i) => (
              <li key={i} className="px-5 py-3 text-sm flex justify-between gap-3">
                <span>{a.text}</span>
                <Link to={a.to as any} className="text-primary shrink-0">Resolver</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="rounded-lg border bg-card">
          <header className="px-5 py-3 border-b flex items-center justify-between">
            <h2 className="font-semibold text-sm">Disciplinas</h2>
            <Link to="/admin/courses" className="text-xs text-primary">Gerir</Link>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-left">
                <tr><th className="px-4 py-2">Disciplina</th><th className="px-4 py-2">Instrutor</th><th className="px-4 py-2 text-right">Alunos</th></tr>
              </thead>
              <tbody>
                {v.courseRows.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-4 py-2">
                      <p className="font-medium">{c.name}</p>
                      {c.code && <p className="text-xs text-muted-foreground">{c.code}</p>}
                    </td>
                    <td className="px-4 py-2">{c.teachers.length ? c.teachers.join(", ") : <span className="text-amber-600">Sem instrutor</span>}</td>
                    <td className="px-4 py-2 text-right">{c.nStudents}</td>
                  </tr>
                ))}
                {v.courseRows.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">Ainda sem disciplinas.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border bg-card">
          <header className="px-5 py-3 border-b flex items-center gap-2 font-semibold text-sm">
            <CalendarClock className="h-4 w-4" /> Próximas aulas
          </header>
          <ul className="divide-y">
            {v.upcoming.map((l) => (
              <li key={l.id} className="px-5 py-3 text-sm">
                <p className="font-medium">{l.title}</p>
                <p className="text-xs text-muted-foreground">{fmtDateTime(l.starts_at)}{l.course ? ` · ${l.course}` : ""}</p>
              </li>
            ))}
            {v.upcoming.length === 0 && <li className="px-5 py-6 text-sm text-center text-muted-foreground">Sem aulas agendadas.</li>}
          </ul>
        </section>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="rounded-lg border bg-card">
          <header className="px-5 py-3 border-b flex items-center justify-between">
            <h2 className="font-semibold text-sm">Utilizadores recentes</h2>
            <Link to="/admin/users" className="text-xs text-primary">Ver todos</Link>
          </header>
          <ul className="divide-y">
            {v.recentUsers.map((u) => (
              <li key={u.id} className="px-5 py-3 text-sm flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{u.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs">{u.roles.length ? u.roles.map(roleLabel).join(", ") : "Sem papel"}</p>
                  <p className="text-[11px] text-muted-foreground">{fmtDate(u.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border bg-card">
          <header className="px-5 py-3 border-b font-semibold text-sm">Últimas entregas de trabalhos</header>
          <ul className="divide-y">
            {v.recentSubs.map((s) => (
              <li key={s.id} className="px-5 py-3 text-sm flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.who} · {fmtDateTime(s.submitted_at)}</p>
                </div>
                <span className={`text-xs rounded px-2 py-0.5 shrink-0 ${s.grade === null ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
                  {s.grade === null ? "Por corrigir" : `${s.grade}/20`}
                </span>
              </li>
            ))}
            {v.recentSubs.length === 0 && <li className="px-5 py-6 text-sm text-center text-muted-foreground">Ainda sem entregas.</li>}
          </ul>
        </section>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Shortcut to="/admin/users" icon={<Users className="h-5 w-5 text-primary mb-2" />} title="Utilizadores" text="Criar contas e atribuir papéis (aluno, instrutor, admin)." />
        <Shortcut to="/admin/courses" icon={<BookOpen className="h-5 w-5 text-primary mb-2" />} title="Disciplinas" text="Criar disciplinas, inscrever alunos e atribuir instrutores." />
        <Shortcut to="/admin/settings" icon={<Settings className="h-5 w-5 text-primary mb-2" />} title="Definições" text="Estado da plataforma e como gerir o acesso." />
      </div>
    </div>
  );
}

function roleLabel(r: string) {
  return r === "admin" ? "Admin" : r === "instructor" ? "Instrutor" : r === "student" ? "Aluno" : r;
}

function Stat({ icon, label, value, highlight }: { icon: ReactNode; label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border bg-card p-4 ${highlight ? "border-amber-400" : ""}`}>
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</p>
      <p className="text-3xl font-semibold mt-1">{value}</p>
    </div>
  );
}

function Shortcut({ to, icon, title, text }: { to: string; icon: ReactNode; title: string; text: string }) {
  return (
    <Link to={to as any} className="rounded-lg border bg-card p-5 hover:border-primary">
      {icon}
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{text}</p>
    </Link>
  );
}
