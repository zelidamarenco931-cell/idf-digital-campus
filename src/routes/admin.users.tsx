import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin/users")({
  component: () => <RequireAuth allow={["admin"]}><Page /></RequireAuth>,
});

type Row = { id: string; full_name: string; email: string | null; roles: string[] };
type Role = "admin" | "instructor" | "student";

const ROLES: { key: Role; label: string }[] = [
  { key: "admin", label: "Admin" },
  { key: "instructor", label: "Instrutor" },
  { key: "student", label: "Aluno" },
];

function Page() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r.full_name ?? "").toLowerCase().includes(q) || (r.email ?? "").toLowerCase().includes(q));
  }, [rows, query]);

  const RoleButtons = ({ r }: { r: Row }) => (
    <div className="flex gap-2 flex-wrap">
      {ROLES.map(({ key, label }) => {
        const has = r.roles.includes(key);
        return (
          <button key={key} type="button" onClick={() => setRole(r.id, key, !has)}
            aria-pressed={has}
            className={`text-xs rounded-full px-3 py-1.5 border ${has ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}>
            {label}
          </button>
        );
      })}
    </div>
  );

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
        <Button type="submit" disabled={creating} className="w-full sm:w-auto">{creating ? "A criar…" : "Criar utilizador"}</Button>
        <p className="text-xs text-muted-foreground">
          O utilizador é criado com email já confirmado e pode iniciar sessão imediatamente.
        </p>
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium">Todos os utilizadores <span className="text-sm text-muted-foreground">({filtered.length})</span></h2>
        </div>
        <Input placeholder="Pesquisar por nome ou email…" value={query} onChange={(e) => setQuery(e.target.value)} />

        {loading && <p className="text-sm text-muted-foreground">A carregar…</p>}
        {!loading && filtered.length === 0 && <p className="text-sm text-muted-foreground">Sem utilizadores.</p>}

        {/* Telemóvel: cartões */}
        <div className="space-y-3 md:hidden">
          {filtered.map((r) => (
            <div key={r.id} className="rounded-lg border bg-card p-4 space-y-3">
              <div className="min-w-0">
                <p className="font-medium break-words">{r.full_name || "—"}</p>
                <p className="text-sm text-muted-foreground break-all">{r.email}</p>
              </div>
              <RoleButtons r={r} />
            </div>
          ))}
        </div>

        {/* Ecrã maior: tabela */}
        <div className="hidden md:block rounded-lg border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left">
              <tr><th className="px-4 py-2">Nome</th><th className="px-4 py-2">Email</th><th className="px-4 py-2">Papéis</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2">{r.full_name || "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.email}</td>
                  <td className="px-4 py-2"><RoleButtons r={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
