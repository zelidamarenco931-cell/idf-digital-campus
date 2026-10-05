import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/student/grades/$courseId")({
  component: () => <RequireAuth allow={["student", "instructor", "admin"]}><Page /></RequireAuth>,
});

const PASS_GRADE = 16;

function Page() {
  const { courseId } = Route.useParams();
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      setError(null);
      const [{ data: c, error: ce }, { data, error: ge }] = await Promise.all([
        supabase.from("courses").select("*").eq("id", courseId).maybeSingle(),
        supabase.from("grades").select("*")
          .eq("course_id", courseId).eq("student_id", user.id).order("created_at"),
      ]);
      if (ce || ge) setError((ce ?? ge)!.message);
      setCourse(c);
      setRows(data ?? []);
      setLoading(false);
    })();
  }, [user, courseId]);

  const totalWeight = rows.reduce((s, r) => s + Number(r.weight || 0), 0);
  // Só conta itens já avaliados; a nota (0–20) é ponderada pelo peso (%)
  const total = rows.reduce((s, r) => s + (Number(r.grade || 0) * Number(r.weight || 0)) / 100, 0);
  const allGraded = rows.length > 0 && rows.every((r) => r.grade != null);
  const complete = allGraded && Math.round(totalWeight) === 100;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground">{course?.code}</p>
        <h1 className="text-2xl font-semibold">Pauta — {course?.name}</h1>
      </div>

      {error && (
        <p className="text-sm text-destructive">Não foi possível carregar as notas: {error}</p>
      )}

      <div className="rounded-lg border bg-card overflow-x-auto">
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
            {loading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">A carregar…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Sem notas lançadas.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2">{r.item}</td>
                <td className="px-4 py-2">{r.weight}</td>
                <td className="px-4 py-2">{r.grade ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">0 – 20</td>
                <td className="px-4 py-2">
                  {r.grade != null ? ((Number(r.grade) * Number(r.weight)) / 100).toFixed(2) : "—"}
                </td>
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
              <td className="px-4 py-2 text-muted-foreground">Mínimo: {PASS_GRADE}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {!loading && rows.length > 0 && (
        complete ? (
          <p className={`text-sm font-medium ${total >= PASS_GRADE ? "text-green-600" : "text-destructive"}`}>
            {total >= PASS_GRADE ? "Aprovado" : "Reprovado"} — nota final {total.toFixed(2)} / 20
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Resultado provisório: ainda há itens por avaliar ou os pesos não somam 100%.
          </p>
        )
      )}

      <p className="text-xs text-muted-foreground">
        Fórmula: Presença 30% · Testes 30% · Trabalhos 40%. Escala 0–20. Nota mínima: {PASS_GRADE}.
      </p>
    </div>
  );
}
