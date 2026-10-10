import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import logo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPage });

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    // Erros de limite de envio são mostrados; para qualquer outro caso a resposta é igual
    // exista ou não a conta, para não revelar que emails estão registados.
    if (error && /rate|limit|seconds/i.test(error.message)) {
      toast.error("Pedido demasiado rápido. Espera um minuto e tenta de novo.");
      return;
    }
    setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <img src={logo} alt="IDF" className="h-20 w-20 object-contain" />
        </div>
        <h1 className="text-2xl font-semibold">Esqueci a senha</h1>

        {sent ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Se existir uma conta com <strong>{email}</strong>, enviamos um link para criares uma nova palavra-passe.
              Verifica a caixa de entrada e o spam. O link expira em pouco tempo.
            </p>
            <a href="/login" className="inline-block text-sm text-primary hover:underline">Voltar ao início de sessão</a>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Escreve o email da tua conta e enviamos-te um link para definires uma nova palavra-passe.
            </p>
            <div>
              <label className="text-sm font-medium">Email</label>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              disabled={busy}
              className="w-full rounded-md bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "A enviar…" : "Enviar link"}
            </button>
            <a href="/login" className="block text-center text-sm text-muted-foreground hover:underline">Voltar</a>
          </form>
        )}
      </div>
    </div>
  );
}
