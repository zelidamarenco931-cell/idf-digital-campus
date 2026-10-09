import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/courses")({
  component: () => <RequireAuth allow={["admin"]}><Page /></RequireAuth>,
});

type Person = { id: string; full_name: string | null; email: string | null };

function Page() {
  const [courses, setCourses] = useState<any[]>([]);
  const [code, setCode] = useState(""); const [name, setName] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [students, setStudents] = useState<Person[]>([]);
  const [instructors, setInstructors] = useState<Person[]>([]);
  const [enrolled, setEnrolled] = useState<Set<string>>(new Set());
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [loadingPeople, setLoadingPeople] = useState(false);

  const refresh = async () => {
    const { data, error } = await supabase.from("courses").select("*").order("name");
    if (error) toast.error(error.message);
    setCourses(data ?? []);
  };
  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (!selected) return;
    (async () => {
      setLoadingPeople(true);
      // Consultas separadas (sem joins), para não depender de relações entre tabelas
      const [roles, profs, en, as] = await Promise.all([
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("profiles").select("id, full_name, email").order("full_name"),
        supabase.from("enrollments").select("student_id").eq("course_id", selected.id),
        supabase.from("instructor_courses").select("instructor_id").eq("course_id", selected.id),
      ]);
      const failed = [roles, profs, en, as].find((x) => x.error);
      if (failed?.error) toast.error(failed.error.message);
      const withRole = (role: string) => new Set((roles.data ?? []).filter((r: any) => r.role === role).map((r: any) => r.user_id));
      const studentIds = withRole("student"), instructorIds = withRole("instructor");
      const all = (profs.data ?? []) as Person[];
      setStudents(all.filter((p) => studentIds.has(p.id)));
      setInstructors(all.filter((p) => instructorIds.has(p.id)));
      setEnrolled(new Set((en.data ?? []).map((r: any) => r.student_id)));
      setAssigned(new Set((as.data ?? []).map((r: any) => r.instructor_id)));
      setLoadingPeople(false);
    })();
  }, [selected]);

  const addCourse = async () => {
    if (!code.trim() || !name.trim()) return toast.error("Indique o código e o nome.");
    const { error } = await supabase.from("courses").insert({ code: code.trim(), name: name.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success("Disciplina criada.");
    setCode(""); setName(""); refresh();
  };

  const toggleEnroll = async (studentId: string) => {
    if (!selected) return;
    const { error } = enrolled.has(studentId)
      ? await supabase.from("enrollments").delete().eq("course_id", selected.id).eq("student_id", studentId)
      : await supabase.from("enrollments").insert({ course_id: selected.id, student_id: studentId });
    if (error) return toast.error(error.message);
    const { data: en } = await supabase.from("enrollments").select("student_id").eq("course_id", selected.id);
    setEnrolled(new Set((en ?? []).map((r: any) => r.student_id)));
  };

  const toggleAssign = async (instructorId: string) => {
    if (!selected) return;
    const { error } = assigned.has(instructorId)
      ? await supabase.from("instructor_courses").delete().eq("course_id", selected.id).eq("instructor_id", instructorId)
      : await supabase.from("instructor_courses").insert({ course_id: selected.id, instructor_id: instructorId });
    if (error) return toast.error(error.message);
    const { data: as } = await supabase.from("instructor_courses").select("instructor_id").eq("course_id", selected.id);
    setAssigned(new Set((as ?? []).map((r: any) => r.instructor_id)));
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Disciplinas</h1>
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <h2 className="font-semibold text-sm">Nova disciplina</h2>
          <div className="flex flex-wrap gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código" className="w-28 rounded border px-2 py-2 text-sm bg-background" />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" className="flex-1 min-w-40 rounded border px-2 py-2 text-sm bg-background" />
            <button onClick={addCourse} className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm">Criar</button>
          </div>
        </div>
        <ul className="rounded-lg border bg-card divide-y">
          {courses.map((c) => (
            <li key={c.id}>
              <button onClick={() => setSelected(c)} className={`w-full text-left px-4 py-3 text-sm ${selected?.id === c.id ? "bg-accent" : "hover:bg-accent/50"}`}>
                <span className="text-xs text-muted-foreground">{c.code}</span>
                <p className="font-medium">{c.name}</p>
              </button>
            </li>
          ))}
          {courses.length === 0 && <li className="px-4 py-6 text-sm text-center text-muted-foreground">Ainda sem disciplinas.</li>}
        </ul>
      </div>

      <div className="space-y-4">
        {!selected ? (
          <p className="text-muted-foreground text-sm">Seleccione uma disciplina para gerir instrutores e inscrições.</p>
        ) : (
          <>
            <h2 className="text-xl font-semibold">{selected.name}</h2>
            {loadingPeople && <p className="text-sm text-muted-foreground">A carregar…</p>}
            <section className="rounded-lg border bg-card p-4">
              <h3 className="font-semibold mb-2">Instrutores <span className="text-xs font-normal text-muted-foreground">({assigned.size} atribuído(s))</span></h3>
              <ul className="space-y-2">
                {instructors.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{p.full_name || p.email}</span>
                    <button onClick={() => toggleAssign(p.id)}
                      className={`text-xs rounded-full px-3 py-1.5 border shrink-0 ${assigned.has(p.id) ? "bg-primary text-primary-foreground" : ""}`}>
                      {assigned.has(p.id) ? "Atribuído" : "Atribuir"}
                    </button>
                  </li>
                ))}
                {!loadingPeople && instructors.length === 0 && <li className="text-sm text-muted-foreground">Nenhum instrutor registado. Crie um em Utilizadores.</li>}
              </ul>
            </section>
            <section className="rounded-lg border bg-card p-4">
              <h3 className="font-semibold mb-2">Alunos <span className="text-xs font-normal text-muted-foreground">({enrolled.size} inscrito(s))</span></h3>
              <ul className="space-y-2 max-h-96 overflow-auto">
                {students.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{p.full_name || p.email}</span>
                    <button onClick={() => toggleEnroll(p.id)}
                      className={`text-xs rounded-full px-3 py-1.5 border shrink-0 ${enrolled.has(p.id) ? "bg-primary text-primary-foreground" : ""}`}>
                      {enrolled.has(p.id) ? "Inscrito" : "Inscrever"}
                    </button>
                  </li>
                ))}
                {!loadingPeople && students.length === 0 && <li className="text-sm text-muted-foreground">Nenhum aluno registado. Crie um em Utilizadores.</li>}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
