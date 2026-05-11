import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/courses")({
  component: () => <RequireAuth allow={["admin"]}><Page /></RequireAuth>,
});

function Page() {
  const [courses, setCourses] = useState<any[]>([]);
  const [code, setCode] = useState(""); const [name, setName] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [instructors, setInstructors] = useState<any[]>([]);
  const [enrolled, setEnrolled] = useState<Set<string>>(new Set());
  const [assigned, setAssigned] = useState<Set<string>>(new Set());

  const refresh = async () => {
    const { data } = await supabase.from("courses").select("*").order("name");
    setCourses(data ?? []);
  };
  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (!selected) return;
    (async () => {
      const [{ data: studs }, { data: instrs }, { data: en }, { data: as }] = await Promise.all([
        supabase.from("user_roles").select("user_id, profiles!inner(id,full_name,email)").eq("role", "student"),
        supabase.from("user_roles").select("user_id, profiles!inner(id,full_name,email)").eq("role", "instructor"),
        supabase.from("enrollments").select("student_id").eq("course_id", selected.id),
        supabase.from("instructor_courses").select("instructor_id").eq("course_id", selected.id),
      ]);
      setStudents((studs ?? []).map((r: any) => r.profiles));
      setInstructors((instrs ?? []).map((r: any) => r.profiles));
      setEnrolled(new Set((en ?? []).map((r: any) => r.student_id)));
      setAssigned(new Set((as ?? []).map((r: any) => r.instructor_id)));
    })();
  }, [selected]);

  const addCourse = async () => {
    if (!code || !name) return;
    const { error } = await supabase.from("courses").insert({ code, name });
    if (error) { toast.error(error.message); return; }
    setCode(""); setName(""); refresh();
  };

  const toggleEnroll = async (studentId: string) => {
    if (!selected) return;
    if (enrolled.has(studentId)) {
      await supabase.from("enrollments").delete().eq("course_id", selected.id).eq("student_id", studentId);
    } else {
      await supabase.from("enrollments").insert({ course_id: selected.id, student_id: studentId });
    }
    const { data: en } = await supabase.from("enrollments").select("student_id").eq("course_id", selected.id);
    setEnrolled(new Set((en ?? []).map((r: any) => r.student_id)));
  };

  const toggleAssign = async (instructorId: string) => {
    if (!selected) return;
    if (assigned.has(instructorId)) {
      await supabase.from("instructor_courses").delete().eq("course_id", selected.id).eq("instructor_id", instructorId);
    } else {
      await supabase.from("instructor_courses").insert({ course_id: selected.id, instructor_id: instructorId });
    }
    const { data: as } = await supabase.from("instructor_courses").select("instructor_id").eq("course_id", selected.id);
    setAssigned(new Set((as ?? []).map((r: any) => r.instructor_id)));
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Disciplinas</h1>
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <h2 className="font-semibold text-sm">Nova disciplina</h2>
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código" className="w-32 rounded border px-2 py-1 text-sm bg-background" />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" className="flex-1 rounded border px-2 py-1 text-sm bg-background" />
            <button onClick={addCourse} className="rounded bg-primary text-primary-foreground px-3 text-sm">Criar</button>
          </div>
        </div>
        <ul className="rounded-lg border bg-card divide-y">
          {courses.map((c) => (
            <li key={c.id}>
              <button onClick={() => setSelected(c)} className={`w-full text-left px-4 py-3 text-sm ${selected?.id===c.id ? "bg-accent" : "hover:bg-accent/50"}`}>
                <span className="text-xs text-muted-foreground">{c.code}</span>
                <p className="font-medium">{c.name}</p>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-4">
        {!selected ? (
          <p className="text-muted-foreground text-sm">Selecciona uma disciplina para gerir inscrições.</p>
        ) : (
          <>
            <h2 className="text-xl font-semibold">{selected.name}</h2>
            <section className="rounded-lg border bg-card p-4">
              <h3 className="font-semibold mb-2">Instrutores</h3>
              <ul className="space-y-1">
                {instructors.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <span>{p.full_name || p.email}</span>
                    <button onClick={() => toggleAssign(p.id)}
                      className={`text-xs rounded-full px-3 py-1 border ${assigned.has(p.id) ? "bg-primary text-primary-foreground" : ""}`}>
                      {assigned.has(p.id) ? "Atribuído" : "Atribuir"}
                    </button>
                  </li>
                ))}
                {instructors.length === 0 && <li className="text-sm text-muted-foreground">Nenhum instrutor registado.</li>}
              </ul>
            </section>
            <section className="rounded-lg border bg-card p-4">
              <h3 className="font-semibold mb-2">Alunos</h3>
              <ul className="space-y-1 max-h-96 overflow-auto">
                {students.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <span>{p.full_name || p.email}</span>
                    <button onClick={() => toggleEnroll(p.id)}
                      className={`text-xs rounded-full px-3 py-1 border ${enrolled.has(p.id) ? "bg-primary text-primary-foreground" : ""}`}>
                      {enrolled.has(p.id) ? "Inscrito" : "Inscrever"}
                    </button>
                  </li>
                ))}
                {students.length === 0 && <li className="text-sm text-muted-foreground">Nenhum aluno registado.</li>}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
