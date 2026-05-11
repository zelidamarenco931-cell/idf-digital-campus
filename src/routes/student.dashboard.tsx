import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen } from "lucide-react";

export const Route = createFileRoute("/student/dashboard")({ component: () => <RequireAuth allow={["student"]}><Page /></RequireAuth> });

type Course = { id: string; code: string; name: string; description: string | null };

function Page() {
  const { user, profile } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("course:courses(id, code, name, description)")
        .eq("student_id", user.id);
      setCourses((data ?? []).map((r: any) => r.course).filter(Boolean));
      setLoading(false);
    })();
  }, [user]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Olá, {profile?.full_name || "estudante"}</h1>
        <p className="text-muted-foreground text-sm">Bem-vindo ao teu painel.</p>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">As minhas disciplinas</h2>
        {loading ? (
          <p className="text-muted-foreground text-sm">A carregar…</p>
        ) : courses.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">
              Ainda não estás inscrito em nenhuma disciplina. Contacta o administrador.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((c) => (
              <Link key={c.id} to="/student/courses/$id" params={{ id: c.id }}
                className="group rounded-lg border bg-card p-5 hover:border-primary hover:shadow-md transition">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">{c.code}</p>
                    <h3 className="font-semibold group-hover:text-primary truncate">{c.name}</h3>
                    {c.description && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{c.description}</p>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
