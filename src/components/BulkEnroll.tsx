import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";

type Row = { full_name: string; email: string; password?: string };
type Result = {
  email: string;
  full_name?: string;
  status: "criado" | "existente" | "erro";
  password?: string;
  enrolled?: "inscrito" | "ja_inscrito" | null;
  message?: string;
};

const CHUNK = 25;

/** Uma linha por aluno: `Nome, email` (ou `Nome; email; senha`). Aceita colar do Excel (separado por tab). */
function parse(text: string): { rows: Row[]; ignored: number } {
  const rows: Row[] = [];
  let ignored = 0;
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split(/[\t;,]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) continue;
    const ei = parts.findIndex((p) => p.includes("@"));
    if (ei < 0) { ignored++; continue; }
    const email = parts[ei].toLowerCase();
    if (seen.has(email)) { ignored++; continue; }
    seen.add(email);
    const others = parts.filter((_, i) => i !== ei);
    rows.push({ email, full_name: others[0] ?? "", password: others[1] });
  }
  return { rows, ignored };
}

const STATUS_LABEL: Record<string, string> = { criado: "Conta criada", existente: "Conta já existia", erro: "Erro" };

export function BulkEnroll({ courseId, courseName, onDone }: { courseId: string; courseName: string; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Result[] | null>(null);

  const { rows, ignored } = useMemo(() => parse(text), [text]);

  const readFile = async (f: File | undefined) => {
    if (!f) return;
    setText(await f.text());
  };

  const run = async () => {
    if (rows.length === 0) return toast.error("Cola pelo menos um aluno com email.");
    if (!confirm(`Criar contas e inscrever ${rows.length} aluno(s) em "${courseName}"?`)) return;
    setBusy(true); setProgress(0); setResults(null);
    const all: Result[] = [];
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const part = rows.slice(i, i + CHUNK);
        const { data, error } = await supabase.functions.invoke("admin-bulk-enroll", { body: { course_id: courseId, rows: part } });
        if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message ?? "Erro no servidor");
        all.push(...((data as any).results as Result[]));
        setProgress(Math.min(rows.length, i + CHUNK));
      }
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao processar. Os que já foram feitos ficam gravados.");
    } finally {
      setBusy(false);
      setResults(all);
      onDone();
    }
    const ok = all.filter((r) => r.status !== "erro").length;
    if (all.length) toast.success(`${ok} de ${rows.length} processados`);
  };

  const downloadCsv = () => {
    if (!results) return;
    const esc = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
    const lines = ["Nome;Email;Palavra-passe;Estado"];
    for (const r of results) {
      const estado = r.status === "erro" ? `Erro: ${r.message ?? ""}` : `${STATUS_LABEL[r.status]}${r.enrolled === "inscrito" ? ", inscrito" : r.enrolled === "ja_inscrito" ? ", já inscrito" : ""}`;
      lines.push([esc(r.full_name ?? ""), esc(r.email), esc(r.password ?? ""), esc(estado)].join(";"));
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `alunos-${courseName.replace(/[^a-zA-Z0-9]+/g, "_")}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const withPassword = results?.filter((r) => r.password).length ?? 0;

  return (
    <section className="rounded-lg border bg-card p-4 space-y-3">
      <h3 className="font-semibold">Inscrever alunos em lote</h3>
      <p className="text-xs text-muted-foreground">
        Cola uma linha por aluno: <span className="font-mono">Nome, email</span>. Se o aluno ainda não tem conta, é criada com uma palavra-passe gerada. Se já tem, só é inscrito. Máximo recomendado: 200 por vez.
      </p>
      <textarea
        value={text} onChange={(e) => setText(e.target.value)} rows={6}
        placeholder={"Maria Silva, maria@email.com\nJoão Machava, joao@email.com"}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-xs rounded-md border px-3 py-2 cursor-pointer hover:bg-accent">
          <Upload className="h-3.5 w-3.5" /> Carregar ficheiro CSV
          <input type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
        </label>
        <Button type="button" onClick={run} disabled={busy || rows.length === 0}>
          {busy ? `A processar ${progress}/${rows.length}…` : `Criar e inscrever ${rows.length || ""} aluno(s)`}
        </Button>
        {text && !busy && <span className="text-xs text-muted-foreground">{rows.length} válido(s){ignored ? `, ${ignored} linha(s) ignorada(s) (sem email ou repetida)` : ""}</span>}
      </div>

      {results && (
        <div className="space-y-2">
          {withPassword > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-xs dark:bg-amber-950/30 dark:text-amber-200">
              As palavras-passe geradas só aparecem agora. Descarrega o ficheiro e entrega a cada aluno; eles podem mudá-la em "Esqueci a senha".
            </div>
          )}
          <Button type="button" variant="outline" size="sm" onClick={downloadCsv}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Descarregar lista (CSV)
          </Button>
          <ul className="divide-y rounded-md border max-h-72 overflow-auto text-sm">
            {results.map((r, i) => (
              <li key={i} className="px-3 py-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate">{r.full_name || r.email}</p>
                  <p className="text-xs text-muted-foreground break-all">{r.email}{r.password ? ` · senha: ${r.password}` : ""}</p>
                </div>
                <span className={`text-xs shrink-0 ${r.status === "erro" ? "text-destructive" : "text-emerald-600"}`}>
                  {r.status === "erro" ? r.message : `${STATUS_LABEL[r.status]}${r.enrolled === "inscrito" ? " · inscrito" : r.enrolled === "ja_inscrito" ? " · já inscrito" : ""}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
