import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/instructor/courses/$id")({
  component: () => <RequireAuth allow={["instructor", "admin"]}><Page /></RequireAuth>,
});

function Page() {
  const { id } = Route.useParams();
  const [course, setCourse] = useState<any>(null);
  const [topics, setTopics] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [newTopic, setNewTopic] = useState("");

  const refresh = async () => {
    const { data: c } = await supabase.from("courses").select("*").eq("id", id).maybeSingle();
    const { data: t } = await supabase.from("course_topics").select("*").eq("course_id", id).order("position");
    const { data: e } = await supabase.from("enrollments")
      .select("student:profiles(id,full_name,email)").eq("course_id", id);
    setCourse(c); setTopics(t ?? []); setStudents((e ?? []).map((r: any) => r.student));
  };
  useEffect(() => { refresh(); }, [id]);

  const addTopic = async () => {
    if (!newTopic.trim()) return;
    const { error } = await supabase.from("course_topics").insert({
      course_id: id, title: newTopic.trim(), position: topics.length,
    });
    if (error) { toast.error(error.message); return; }
    setNewTopic(""); refresh();
  };

  if (!course) return <p>A carregar…</p>;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground">{course.code}</p>
        <h1 className="text-2xl font-semibold">{course.name}</h1>
      </div>

      <section className="rounded-lg border bg-card p-5 space-y-3">
        <h2 className="font-semibold">Tópicos</h2>
        {topics.map((t, i) => (
          <div key={t.id} className="flex justify-between border-b last:border-0 py-2">
            <span className="text-sm">Tópico {i + 1}: {t.title}</span>
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)}
            placeholder="Novo tópico" className="flex-1 rounded border px-3 py-2 text-sm bg-background" />
          <button onClick={addTopic} className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm">Adicionar</button>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold mb-3">Alunos inscritos ({students.length})</h2>
        <ul className="divide-y">
          {students.map((s) => (
            <li key={s.id} className="py-2 text-sm flex justify-between">
              <span>{s.full_name || "—"}</span>
              <span className="text-muted-foreground">{s.email}</span>
            </li>
          ))}
          {students.length === 0 && <li className="py-2 text-sm text-muted-foreground">Sem alunos inscritos.</li>}
        </ul>
      </section>
    </div>
  );
}
