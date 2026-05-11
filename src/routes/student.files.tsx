import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Upload, Trash2, FolderLock } from "lucide-react";

export const Route = createFileRoute("/student/files")({
  component: () => <RequireAuth allow={["student", "instructor", "admin"]}><Page /></RequireAuth>,
});

function Page() {
  const { user } = useAuth();
  const [files, setFiles] = useState<any[]>([]);
  const [title, setTitle] = useState(""); const [file, setFile] = useState<File | null>(null);

  const refresh = async () => {
    if (!user) return;
    const { data } = await supabase.from("private_files").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    const withUrls = await Promise.all((data ?? []).map(async (f: any) => {
      const { data: s } = await supabase.storage.from("private-files").createSignedUrl(f.file_path, 3600);
      return { ...f, url: s?.signedUrl };
    }));
    setFiles(withUrls);
  };
  useEffect(() => { refresh(); }, [user]);

  const upload = async () => {
    if (!file || !title || !user) return toast.error("Título e ficheiro obrigatórios");
    const path = `${user.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("private-files").upload(path, file);
    if (upErr) return toast.error(upErr.message);
    const { error } = await supabase.from("private_files").insert({ user_id: user.id, title, file_path: path });
    if (error) return toast.error(error.message);
    setTitle(""); setFile(null); refresh();
  };

  const del = async (f: any) => {
    if (!confirm("Eliminar?")) return;
    await supabase.storage.from("private-files").remove([f.file_path]);
    await supabase.from("private_files").delete().eq("id", f.id);
    refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FolderLock className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold">Ficheiros privados</h1>
      </div>
      <div className="rounded-lg border bg-card p-4 grid sm:grid-cols-3 gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" className="rounded border px-2 py-1.5 text-sm bg-background" />
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
        <button onClick={upload} className="rounded bg-primary text-primary-foreground text-sm px-3"><Upload className="h-4 w-4 inline mr-1" />Carregar</button>
      </div>
      <ul className="rounded-lg border bg-card divide-y">
        {files.map((f) => (
          <li key={f.id} className="px-4 py-3 flex items-center justify-between text-sm">
            <a href={f.url} target="_blank" rel="noreferrer" className="hover:text-primary">{f.title}</a>
            <button onClick={() => del(f)} className="text-destructive hover:bg-destructive/10 p-1 rounded"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
        {files.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Ainda não tens ficheiros.</li>}
      </ul>
    </div>
  );
}
