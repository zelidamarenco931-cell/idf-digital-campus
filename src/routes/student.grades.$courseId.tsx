import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/student/grades/$courseId")({
  component: () => <RequireAuth allow={["student", "instructor", "admin"]}><Page /></RequireAuth>,
});

function Page() {
  const { courseId } = Route.useParams();
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [course, setCourse] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: c } = await supabase.from("courses").select("*").eq("id", courseId).maybeSingle();
      setCourse(c);
      const { data } = await supabase.from("grades").select("*")
        .eq("course_id", courseId).eq("student_id", user.id).order("created_at");
      setRows(data ?? []);
    })();
  }, [user, courseId]);

  const totalWeight = rows.reduce((s, r) => s + Number(r.weight || 0), 0);
  const total = rows.reduce((s, r) => s + (Number(r.grade || 0) * Number(r.weight || 0)) / 100, 0);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground">{course?.code}</p>
        <h1 className="text-2xl font-semibold">Pauta — {course?.name}</h1>
      </div>
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium">Item de avaliação</th>
              <th className="px-4 py-2 font-medium">Peso (%)</th>
              <th className="px-4 py-2 font-medium">Nota</th>
              <th className="px-4 py-2 font-medium">Intervalo</th>
              <th className="px-4 py-2 font-medium">Contribuição</th>
              <th className="px-4 py-2 font-medium">Feedback</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Sem notas lançadas.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2">{r.item}</td>
                <td className="px-4 py-2">{r.weight}</td>
                <td className="px-4 py-2">{r.grade ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">0 – 20</td>
                <td className="px-4 py-2">{r.grade != null ? ((r.grade * r.weight) / 100).toFixed(2) : "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.feedback || "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-secondary/30">
            <tr className="border-t font-semibold">
              <td className="px-4 py-2">Total</td>
              <td className="px-4 py-2">{totalWeight}</td>
              <td className="px-4 py-2">—</td>
              <td className="px-4 py-2">0 – 20</td>
              <td className="px-4 py-2">{total.toFixed(2)}</td>
              <td className="px-4 py-2 text-muted-foreground">Mínimo: 16</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Fórmula: Presença 30% · Testes 30% · Trabalhos 40%. Escala 0–20. Nota mínima: 16.
      </p>
    </div>
  );
}
