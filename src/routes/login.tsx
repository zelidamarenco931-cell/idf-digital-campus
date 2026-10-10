import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import logo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, primaryRole } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { user, loading, roles } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    const r = primaryRole(roles);
    return <Navigate to={r === "admin" ? "/admin/dashboard" : r === "instructor" ? "/instructor/dashboard" : "/student/dashboard"} />;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      toast.error("Credenciais inválidas. Verifica o email e a palavra-passe, ou toca em \"Esqueci a senha\".");
      return;
    }
    toast.success("Bem-vindo!");
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between bg-topbar text-topbar-foreground p-10">
        <div className="flex items-center">
          <img src={logo} alt="IDF" className="h-20 w-20 rounded-lg bg-white object-contain p-2 shadow-lg" />
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">Instituto Digital de Formação</h1>
          <p className="mt-3 opacity-90 max-w-md">
            Plataforma académica fechada para alunos inscritos, instrutores e administradores.
          </p>
        </div>
        <p className="text-sm opacity-75">© {new Date().getFullYear()} IDF</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex justify-center mb-6">
            <img src={logo} alt="IDF" className="h-20 w-20 object-contain" />
          </div>
          <h2 className="text-2xl font-semibold">Iniciar sessão</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Acesso restrito a contas criadas pelo administrador.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-medium">Email</label>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Palavra-passe</label>
                <a href="/forgot-password" className="text-xs text-primary hover:underline">Esqueci a senha</a>
              </div>
              <input
                type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              disabled={submitting}
              className="w-full rounded-md bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "A entrar…" : "Entrar"}
            </button>
          </form>

          <p className="mt-6 text-xs text-muted-foreground text-center">
            Não tens conta? Contacta o administrador da plataforma.
          </p>
        </div>
      </div>
    </div>
  );
}
