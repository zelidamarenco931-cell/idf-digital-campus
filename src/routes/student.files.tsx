import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";

export const Route = createFileRoute("/student/files")({
  component: () => <RequireAuth allow={["student"]}><Page /></RequireAuth>,
});

function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Ficheiros privados</h1>
      <p className="text-muted-foreground text-sm">Espaço para os teus ficheiros pessoais. Em breve.</p>
    </div>
  );
}
