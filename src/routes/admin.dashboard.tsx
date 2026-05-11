import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, BookOpen } from "lucide-react";

export const Route = createFileRoute("/admin/dashboard")({
  component: () => <RequireAuth allow={["admin"]}><Page /></RequireAuth>,
});

function Page() {
  const [counts, setCounts] = useState({ users: 0, courses: 0, enrollments: 0 });
  useEffect(() => {
    (async () => {
      const [u, c, e] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("courses").select("*", { count: "exact", head: true }),
        supabase.from("enrollments").select("*", { count: "exact", head: true }),
      ]);
      setCounts({ users: u.count ?? 0, courses: c.count ?? 0, enrollments: e.count ?? 0 });
    })();
  }, []);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Painel do administrador</h1>
      <div className="grid sm:grid-cols-3 gap-4">
        <Stat label="Utilizadores" value={counts.users} />
        <Stat label="Disciplinas" value={counts.courses} />
        <Stat label="Inscrições" value={counts.enrollments} />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Link to="/admin/users" className="rounded-lg border bg-card p-5 hover:border-primary">
          <Users className="h-5 w-5 text-primary mb-2" />
          <h3 className="font-semibold">Gerir utilizadores</h3>
          <p className="text-sm text-muted-foreground">Criar alunos, instrutores e admins; atribuir papéis.</p>
        </Link>
        <Link to="/admin/courses" className="rounded-lg border bg-card p-5 hover:border-primary">
          <BookOpen className="h-5 w-5 text-primary mb-2" />
          <h3 className="font-semibold">Gerir disciplinas</h3>
          <p className="text-sm text-muted-foreground">Criar disciplinas, inscrever alunos, atribuir instrutores.</p>
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-semibold mt-1">{value}</p>
    </div>
  );
}
