import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";

export const Route = createFileRoute("/admin/settings")({
  component: () => <RequireAuth allow={["admin"]}><Page /></RequireAuth>,
});

function Page() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Definições</h1>
      <p className="text-sm text-muted-foreground">
        A criação de utilizadores faz-se a partir do backend (Lovable Cloud → Users).
        Depois de criar a conta, atribua o papel adequado em "Utilizadores".
      </p>
    </div>
  );
}
