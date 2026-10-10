import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import logo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({ component: ResetPage });

function ResetPage() {
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  // O link do email inicia sessão automaticamente; esperamos por essa sessão.
  useEffect(() => {
    let done = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (s && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        done = true; setReady(true); setInvalid(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) { done = true; setReady(true); }
    });
    const t = setTimeout(() => { if (!done) setInvalid(true); }, 4000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return toast.error("A palavra-passe precisa de pelo menos 8 caracteres.");
    if (pw !== pw2) return toast.error("As palavras-passe não coincidem.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      toast.error(/same|different/i.test(error.message)
        ? "Escolhe uma palavra-passe diferente da anterior."
        : /weak|pwned|compromised|easy/i.test(error.message)
          ? "Palavra-passe demasiado fraca ou conhecida. Escolhe outra."
          : error.message);
      return;
    }
    toast.success("Palavra-passe alterada com sucesso.");
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <img src={logo} alt="IDF" className="h-20 w-20 object-contain" />
        </div>
        <h1 className="text-2xl font-semibold">Nova palavra-passe</h1>

        {ready ? (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <div>
              <label className="text-sm font-medium">Nova palavra-passe</label>
              <input
                type="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
                className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground mt-1">Mínimo 8 caracteres.</p>
            </div>
            <div>
              <label className="text-sm font-medium">Repete a palavra-passe</label>
              <input
                type="password" required value={pw2} onChange={(e) => setPw2(e.target.value)}
                autoComplete="new-password"
                className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              disabled={busy}
              className="w-full rounded-md bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "A guardar…" : "Guardar palavra-passe"}
            </button>
          </form>
        ) : invalid ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Este link já expirou ou já foi usado. Pede um novo link.
            </p>
            <a href="/forgot-password" className="inline-block rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">Pedir novo link</a>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">A validar o link…</p>
        )}
      </div>
    </div>
  );
}
