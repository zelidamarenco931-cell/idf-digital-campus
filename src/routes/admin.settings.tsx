import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin/settings")({
  component: () => <RequireAuth allow={["admin"]}><Page /></RequireAuth>,
});

function Page() {
  const { profile, user } = useAuth();
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Definições</h1>
        <p className="text-sm text-muted-foreground">Conta de administrador e gestão de acessos.</p>
      </div>

      <section className="rounded-lg border bg-card p-5 space-y-1 text-sm">
        <h2 className="font-semibold mb-2">A sua conta</h2>
        <p><span className="text-muted-foreground">Nome:</span> {profile?.full_name || "—"}</p>
        <p><span className="text-muted-foreground">Email:</span> {user?.email ?? profile?.email ?? "—"}</p>
        <p><span className="text-muted-foreground">Papel:</span> Administrador</p>
      </section>

      <section className="rounded-lg border bg-card p-5 space-y-2 text-sm">
        <h2 className="font-semibold">Como gerir acessos</h2>
        <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
          <li>Crie a conta em <Link to="/admin/users" className="text-primary">Utilizadores</Link> (nome, email, palavra-passe e papel).</li>
          <li>Inscreva os alunos e atribua os instrutores em <Link to="/admin/courses" className="text-primary">Disciplinas</Link>.</li>
          <li>Para mudar o papel de uma conta existente, use a lista em Utilizadores.</li>
        </ol>
      </section>

      <section className="rounded-lg border bg-card p-5 space-y-2 text-sm">
        <h2 className="font-semibold">Segurança recomendada</h2>
        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
          <li>Desative o registo público no Supabase (Authentication → Sign In / Providers → "Allow new users to sign up"), porque as contas são criadas por si.</li>
          <li>Use palavras-passe fortes e não as partilhe por mensagem.</li>
          <li>Mantenha poucos administradores.</li>
        </ul>
      </section>
    </div>
  );
}
