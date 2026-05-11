import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Video, FileText, ClipboardList, FileCheck2 } from "lucide-react";

export const Route = createFileRoute("/student/courses/$id")({
  component: () => <RequireAuth allow={["student", "instructor", "admin"]}><Page /></RequireAuth>,
});

function fmt(d?: string | null) { if (!d) return ""; return new Date(d).toLocaleString("pt-PT"); }

function Page() {
  const { id } = Route.useParams();
  const [course, setCourse] = useState<any>(null);
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: c } = await supabase.from("courses").select("*").eq("id", id).maybeSingle();
      const { data: t } = await supabase.from("course_topics")
        .select("id,title,description,position, lessons:zoom_lessons(id,title,starts_at,ends_at,zoom_url), materials:lesson_materials(id,title,file_url), quizzes(id,title,opens_at,closes_at), assignments(id,title,due_at)")
        .eq("course_id", id).order("position");
      setCourse(c); setTopics(t ?? []); setLoading(false);
    })();
  }, [id]);

  if (loading) return <p className="text-muted-foreground">A carregar…</p>;
  if (!course) return <p>Disciplina não encontrada ou sem acesso.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{course.code}</p>
          <h1 className="text-2xl font-semibold">{course.name}</h1>
        </div>
        <Link to="/student/grades/$courseId" params={{ courseId: course.id }}
          className="text-sm rounded-md bg-primary text-primary-foreground px-3 py-2">
          Ver Pauta
        </Link>
      </div>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold">Geral</h2>
        <p className="text-sm text-muted-foreground mt-1">{course.description || "Sem descrição."}</p>
      </section>

      {topics.length === 0 && (
        <p className="text-muted-foreground text-sm">Ainda não há tópicos publicados.</p>
      )}

      {topics.map((t, i) => (
        <section key={t.id} className="rounded-lg border bg-card">
          <header className="px-5 py-3 border-b bg-secondary/40">
            <h3 className="font-semibold">Tópico {i + 1}: {t.title}</h3>
            {t.description && <p className="text-sm text-muted-foreground mt-0.5">{t.description}</p>}
          </header>
          <ul className="divide-y">
            {(t.lessons ?? []).map((l: any) => {
              const now = Date.now();
              const start = new Date(l.starts_at).getTime();
              const end = l.ends_at ? new Date(l.ends_at).getTime() : start + 3600_000;
              const state = now < start ? "Em breve" : now > end ? "Terminada" : "A decorrer";
              return (
                <li key={l.id} className="px-5 py-3 flex items-center gap-3">
                  <Video className="h-4 w-4 text-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{l.title}</p>
                    <p className="text-xs text-muted-foreground">{fmt(l.starts_at)} — {state}</p>
                  </div>
                  {l.zoom_url && state !== "Terminada" && (
                    <a href={l.zoom_url} target="_blank" rel="noreferrer"
                      className="text-xs rounded bg-primary text-primary-foreground px-2 py-1">Entrar na aula</a>
                  )}
                </li>
              );
            })}
            {(t.materials ?? []).map((m: any) => (
              <li key={m.id} className="px-5 py-3 flex items-center gap-3">
                <FileText className="h-4 w-4 text-primary" />
                <div className="flex-1"><p className="text-sm">{m.title}</p></div>
                {m.file_url && <a href={m.file_url} target="_blank" rel="noreferrer" className="text-xs text-primary">Abrir</a>}
              </li>
            ))}
            {(t.quizzes ?? []).map((q: any) => {
              const closed = q.closes_at && Date.now() > new Date(q.closes_at).getTime();
              return (
                <li key={q.id} className="px-5 py-3 flex items-center gap-3">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{q.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {closed ? `O teste fechou em ${fmt(q.closes_at)}` : `Disponível${q.closes_at ? ` até ${fmt(q.closes_at)}` : ""}`}
                    </p>
                  </div>
                  {!closed && (
                    <Link to="/student/quiz/$id" params={{ id: q.id }} className="text-xs rounded bg-primary text-primary-foreground px-2 py-1">Abrir teste</Link>
                  )}
                </li>
              );
            })}
            {(t.assignments ?? []).map((a: any) => (
              <li key={a.id} className="px-5 py-3 flex items-center gap-3">
                <FileCheck2 className="h-4 w-4 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">Entregar até {fmt(a.due_at)}</p>
                </div>
                <Link to="/student/assignment/$id" params={{ id: a.id }} className="text-xs rounded bg-primary text-primary-foreground px-2 py-1">Submeter</Link>
              </li>
            ))}
            {(!t.lessons?.length && !t.materials?.length && !t.quizzes?.length && !t.assignments?.length) && (
              <li className="px-5 py-3 text-sm text-muted-foreground">Sem itens neste tópico.</li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
