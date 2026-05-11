import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Upload, FileCheck2 } from "lucide-react";

export const Route = createFileRoute("/student/assignment/$id")({
  component: () => <RequireAuth allow={["student", "instructor", "admin"]}><Page /></RequireAuth>,
});

function Page() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const [a, setA] = useState<any>(null);
  const [sub, setSub] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);

  const refresh = async () => {
    const { data } = await supabase.from("assignments").select("*").eq("id", id).maybeSingle();
    setA(data);
    if (user) {
      const { data: s } = await supabase.from("assignment_submissions")
        .select("*").eq("assignment_id", id).eq("student_id", user.id).maybeSingle();
      setSub(s);
    }
  };
  useEffect(() => { refresh(); }, [id, user]);

  const upload = async () => {
    if (!file || !user) return;
    const path = `${id}/${user.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("assignment-submissions").upload(path, file);
    if (upErr) return toast.error(upErr.message);
    const { data: signed } = await supabase.storage.from("assignment-submissions").createSignedUrl(path, 60 * 60 * 24 * 365);
    const { error } = await supabase.from("assignment_submissions").insert({
      assignment_id: id, student_id: user.id, file_path: path, file_url: signed?.signedUrl ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success("Trabalho submetido!"); setFile(null); refresh();
  };

  if (!a) return <p className="text-muted-foreground">A carregar…</p>;
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{a.title}</h1>
        <p className="text-sm text-muted-foreground">Entrega até {a.due_at ? new Date(a.due_at).toLocaleString("pt-PT") : "—"}</p>
      </div>
      {a.description && <div className="rounded-lg border bg-card p-5"><p className="text-sm whitespace-pre-wrap">{a.description}</p></div>}

      <div className="rounded-lg border bg-card p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><FileCheck2 className="h-4 w-4" /> A minha submissão</h2>
        {sub ? (
          <div className="text-sm">
            <p>Submetido em {new Date(sub.submitted_at).toLocaleString("pt-PT")}</p>
            {sub.file_url && <a href={sub.file_url} target="_blank" rel="noreferrer" className="text-primary">Ver ficheiro entregue</a>}
            {sub.grade != null && <p className="mt-2 font-semibold">Nota: {sub.grade}/20</p>}
            {sub.feedback && <p className="text-muted-foreground mt-1">Feedback: {sub.feedback}</p>}
          </div>
        ) : (
          <>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
            <button onClick={upload} disabled={!file} className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50">
              <Upload className="h-4 w-4 inline mr-1" /> Submeter trabalho
            </button>
          </>
        )}
      </div>
    </div>
  );
}
