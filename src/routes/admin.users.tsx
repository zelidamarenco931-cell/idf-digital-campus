import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin/users")({
  component: () => <RequireAuth allow={["admin"]}><Page /></RequireAuth>,
});

type Row = { id: string; full_name: string; email: string | null; roles: string[] };
type Role = "admin" | "instructor" | "student";

function Page() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "student" as Role });

  const refresh = async () => {
    setLoading(true);
    const [{ data: profs, error: pe }, { data: rs, error: re }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").order("full_name"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (pe || re) toast.error((pe ?? re)!.message);
    const map = new Map<string, string[]>();
    (rs ?? []).forEach((r: any) => {
      const a = map.get(r.user_id) ?? []; a.push(r.role); map.set(r.user_id, a);
    });
    setRows((profs ?? []).map((p: any) => ({ ...p, roles: map.get(p.id) ?? [] })));
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  const setRole = async (userId: string, role: Role, add: boolean) => {
    // Evita que o administrador perca o próprio acesso por engano
    if (!add && role === "admin" && userId === user?.id) {
      toast.error("Não pode remover o seu próprio papel de administrador.");
      return;
    }
    if (add) {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error && !error.message.includes("duplicate")) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      if (error) { toast.error(error.message); return; }
    }
    refresh();
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password || form.password.length < 6) {
      toast.error("Email e palavra-passe (mín. 6) obrigatórios.");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("admin-create-user", { body: form });
    setCreating(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Erro ao criar utilizador.");
      return;
    }
    toast.success("Utilizador criado com sucesso.");
    setForm({ full_name: "", email: "", password: "", role: "student" });
    refresh();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Utilizadores</h1>

      <form onSubmit={createUser} className="rounded-lg border bg-card p-4 space-y-3" autoComplete="off">
        <h2 className="font-medium">Criar novo utilizador</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder="Nome completo" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <Input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <Input type="password" autoComplete="new-password" placeholder="Palavra-passe (mín. 6)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          >
            <option value="student">Aluno</option>
            <option value="instructor">Instrutor</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <Button type="submit" disabled={creating}>{creating ? "A criar…" : "Criar utilizador"}</Button>
        <p className="text-xs text-muted-foreground">
          O utilizador é criado com email já confirmado e pode iniciar sessão imediatamente.
        </p>
      </form>

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
                        <button key={role} type="button" onClick={() => setRole(r.id, role, !has)}
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
