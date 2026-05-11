import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen } from "lucide-react";

export const Route = createFileRoute("/student/courses/")({
  component: () => <RequireAuth allow={["student"]}><Page /></RequireAuth>,
});

function Page() {
  const { user } = useAuth();
  const [list, setList] = useState<any[]>([]);
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("enrollments")
        .select("course:courses(id,code,name,description)").eq("student_id", user.id);
      setList((data ?? []).map((x: any) => x.course).filter(Boolean));
    })();
  }, [user]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">As minhas disciplinas</h1>
      {list.length === 0 ? (
        <p className="text-muted-foreground text-sm">Ainda não estás inscrito em nenhuma disciplina.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((c) => (
            <Link key={c.id} to="/student/courses/$id" params={{ id: c.id }}
              className="rounded-lg border bg-card p-5 hover:border-primary transition">
              <BookOpen className="h-5 w-5 text-primary mb-2" />
              <p className="text-xs text-muted-foreground">{c.code}</p>
              <h3 className="font-semibold">{c.name}</h3>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
