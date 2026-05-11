import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/student/quiz/$id")({
  component: () => <RequireAuth allow={["student", "instructor", "admin"]}><Page /></RequireAuth>,
});

function Page() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data: q } = await supabase.from("quizzes").select("*").eq("id", id).maybeSingle();
      const { data: qs } = await supabase.from("questions").select("id,text,options,position").eq("quiz_id", id).order("position");
      setQuiz(q); setQuestions(qs ?? []);
    })();
  }, [id]);

  const submit = async () => {
    if (!user) return;
    const { data: full } = await supabase.from("questions").select("id,correct_index").eq("quiz_id", id);
    let correct = 0;
    (full ?? []).forEach((q: any) => { if (answers[q.id] === q.correct_index) correct++; });
    const finalScore = full && full.length ? (correct / full.length) * 20 : 0;
    const { error } = await supabase.from("quiz_attempts").insert({
      quiz_id: id, student_id: user.id, answers, score: finalScore, submitted_at: new Date().toISOString(),
    });
    if (error) return toast.error(error.message);
    setScore(finalScore);
    toast.success(`Submetido! Nota: ${finalScore.toFixed(2)}/20`);
  };

  if (!quiz) return <p className="text-muted-foreground">A carregar…</p>;
  if (score !== null) return (
    <div className="max-w-2xl mx-auto rounded-lg border bg-card p-8 text-center space-y-4">
      <h1 className="text-2xl font-semibold">Teste submetido</h1>
      <p className="text-4xl font-bold text-primary">{score.toFixed(2)} / 20</p>
      <button onClick={() => navigate({ to: "/student/dashboard" })} className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm">Voltar</button>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{quiz.title}</h1>
        {quiz.description && <p className="text-muted-foreground text-sm">{quiz.description}</p>}
      </div>
      {questions.map((q, i) => (
        <div key={q.id} className="rounded-lg border bg-card p-5 space-y-3">
          <p className="font-medium">{i + 1}. {q.text}</p>
          {(q.options as string[]).map((opt: string, j: number) => (
            <label key={j} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name={q.id} checked={answers[q.id] === j} onChange={() => setAnswers({ ...answers, [q.id]: j })} />
              {opt}
            </label>
          ))}
        </div>
      ))}
      <button onClick={submit} className="rounded bg-primary text-primary-foreground px-6 py-2 text-sm">Submeter teste</button>
    </div>
  );
}
