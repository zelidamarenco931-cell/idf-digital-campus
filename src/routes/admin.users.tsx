import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/users")({
  component: () => <RequireAuth allow={["admin"]}><Page /></RequireAuth>,
});

type Row = { id: string; full_name: string; email: string | null; roles: string[] };

function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const { data: profs } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
    const { data: rs } = await supabase.from("user_roles").select("user_id, role");
    const map = new Map<string, string[]>();
    (rs ?? []).forEach((r: any) => {
      const a = map.get(r.user_id) ?? []; a.push(r.role); map.set(r.user_id, a);
    });
    setRows((profs ?? []).map((p: any) => ({ ...p, roles: map.get(p.id) ?? [] })));
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  const setRole = async (userId: string, role: "admin" | "instructor" | "student", add: boolean) => {
    if (add) {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error && !error.message.includes("duplicate")) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      if (error) { toast.error(error.message); return; }
    }
    refresh();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Utilizadores</h1>
      <p className="text-sm text-muted-foreground">
        Apenas o administrador atribui papéis. Novos utilizadores são criados via convite no backend.
      </p>
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-left">
            <tr><th className="px-4 py-2">Nome</th><th className="px-4 py-2">Email</th><th className="px-4 py-2">Papéis</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">A carregar…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">Sem utilizadores.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2">{r.full_name || "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.email}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-2 flex-wrap">
                    {(["admin","instructor","student"] as const).map((role) => {
                      const has = r.roles.includes(role);
                      return (
                        <button key={role} onClick={() => setRole(r.id, role, !has)}
                          className={`text-xs rounded-full px-3 py-1 border ${has ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}>
                          {role}
                        </button>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
