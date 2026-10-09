import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Video, FileText, ClipboardList, FileCheck2, Trash2, Plus, Upload, CheckSquare, Award, ExternalLink, Paperclip, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/instructor/courses/$id")({
  component: () => <RequireAuth allow={["instructor", "admin"]}><Page /></RequireAuth>,
});

/* ---------------- HELPERS ---------------- */

// Todas as horas são introduzidas e mostradas na hora de Moçambique (UTC+2, sem horário de verão),
// independentemente do fuso do telemóvel/computador. Sem isto, o servidor interpretava a hora como UTC
// e as aulas e prazos ficavam 2 horas errados.
const APP_TZ = "Africa/Maputo";

/** Converte o valor de um <input type="datetime-local"> (hora de Maputo) para ISO/UTC. */
function toIso(local: string) {
  const withSeconds = local.length === 16 ? `${local}:00` : local;
  return new Date(`${withSeconds}+02:00`).toISOString();
}

function fmt(d?: string | null) {
  return d ? new Date(d).toLocaleString("pt-PT", { timeZone: APP_TZ, dateStyle: "short", timeStyle: "short" }) : "";
}

function fmtTime(d?: string | null) {
  return d ? new Date(d).toLocaleTimeString("pt-PT", { timeZone: APP_TZ, hour: "2-digit", minute: "2-digit" }) : "";
}

/** yyyy-mm-dd no fuso de Maputo */
function dayKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function fmtDay(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("pt-PT", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** Nomes com acentos/espaços/símbolos fazem o upload falhar ("Invalid key"). */
function safeName(name: string) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_");
}

async function uploadToMaterials(topicId: string, file: File, folder = "") {
  const path = `${topicId}/${folder}${Date.now()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from("course-materials").upload(path, file);
  if (error) throw error;
  const { data: signed } = await supabase.storage.from("course-materials").createSignedUrl(path, 60 * 60 * 24 * 365);
  return { path, url: signed?.signedUrl ?? null };
}

async function removeRow(table: string, id: string, ask: string, onChange: () => void) {
  if (!confirm(ask)) return;
  const { error } = await (supabase as any).from(table).delete().eq("id", id);
  if (error) return toast.error(error.message);
  onChange();
}

const inputCls = "rounded border px-2 py-1.5 text-sm bg-background w-full";
const btnCls = "rounded bg-primary text-primary-foreground text-sm px-3 py-1.5";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/* ---------------- PAGE ---------------- */

function Page() {
  const { id } = Route.useParams();
  const [course, setCourse] = useState<any>(null);
  const [topics, setTopics] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [tab, setTab] = useState<"content" | "calendar" | "students" | "grades" | "attendance">("content");
  const [newTopic, setNewTopic] = useState("");

  const refresh = async () => {
    const { data: c } = await supabase.from("courses").select("*").eq("id", id).maybeSingle();
    const { data: t } = await supabase.from("course_topics")
      .select("*, lessons:zoom_lessons(*), materials:lesson_materials(*), quizzes(*, questions(*)), assignments(*)")
      .eq("course_id", id).order("position");
    const { data: e } = await supabase.from("enrollments")
      .select("student:profiles(id,full_name,email)").eq("course_id", id);
    setCourse(c); setTopics(t ?? []); setStudents((e ?? []).map((r: any) => r.student).filter(Boolean));
  };
  useEffect(() => { refresh(); }, [id]);

  const addTopic = async () => {
    if (!newTopic.trim()) return;
    const { error } = await supabase.from("course_topics").insert({ course_id: id, title: newTopic.trim(), position: topics.length });
    if (error) return toast.error(error.message);
    setNewTopic(""); refresh();
  };

  if (!course) return <p className="text-muted-foreground">A carregar…</p>;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground">{course.code}</p>
        <h1 className="text-2xl font-semibold">{course.name}</h1>
      </div>

      <div className="border-b flex gap-1 overflow-x-auto">
        {[
          ["content", "Conteúdo"],
          ["calendar", "Calendário"],
          ["students", `Alunos (${students.length})`],
          ["grades", "Pautas"],
          ["attendance", "Presenças"],
        ].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px whitespace-nowrap ${tab === k ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "content" && (
        <>
          <div className="rounded-lg border bg-card p-4 flex gap-2">
            <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)}
              placeholder="Novo tópico (ex: Tópico 1 — Introdução)"
              className="flex-1 rounded border px-3 py-2 text-sm bg-background" />
            <button onClick={addTopic} className="rounded bg-primary text-primary-foreground px-4 text-sm">
              <Plus className="h-4 w-4 inline" /> Adicionar
            </button>
          </div>

          {topics.map((t, i) => (
            <TopicEditor key={t.id} topic={t} index={i} onChange={refresh}
              onDelete={() => removeRow("course_topics", t.id, "Eliminar tópico e todo o seu conteúdo?", refresh)} />
          ))}
          {topics.length === 0 && <p className="text-muted-foreground text-sm">Sem tópicos. Cria o primeiro acima.</p>}
        </>
      )}

      {tab === "calendar" && <CalendarPanel courseId={id} topics={topics} />}

      {tab === "students" && (
        <section className="rounded-lg border bg-card divide-y">
          {students.map((s) => (
            <div key={s.id} className="px-4 py-3 flex justify-between text-sm">
              <span>{s.full_name || "—"}</span>
              <span className="text-muted-foreground">{s.email}</span>
            </div>
          ))}
          {students.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">Sem alunos inscritos.</p>}
        </section>
      )}

      {tab === "grades" && <GradesPanel courseId={id} students={students} />}
      {tab === "attendance" && <AttendancePanel topics={topics} students={students} />}
    </div>
  );
}

/* ---------------- TOPIC EDITOR ---------------- */
function TopicEditor({ topic, index, onChange, onDelete }: any) {
  return (
    <section className="rounded-lg border bg-card">
      <header className="px-5 py-3 border-b bg-secondary/40 flex justify-between items-center">
        <h3 className="font-semibold">Tópico {index + 1}: {topic.title}</h3>
        <button onClick={onDelete} className="text-destructive hover:bg-destructive/10 p-1 rounded" aria-label="Eliminar tópico"><Trash2 className="h-4 w-4" /></button>
      </header>
      <div className="p-5 space-y-6">
        <LessonsBlock topicId={topic.id} lessons={topic.lessons || []} onChange={onChange} />
        <MaterialsBlock topicId={topic.id} materials={topic.materials || []} onChange={onChange} />
        <QuizzesBlock topicId={topic.id} quizzes={topic.quizzes || []} onChange={onChange} />
        <AssignmentsBlock topicId={topic.id} assignments={topic.assignments || []} onChange={onChange} />
      </div>
    </section>
  );
}

/* ---------------- LESSONS (ZOOM) ---------------- */
const DURATIONS = [30, 45, 60, 90, 120, 180];

function LessonsBlock({ topicId, lessons, onChange }: any) {
  const [title, setTitle] = useState(""); const [url, setUrl] = useState(""); const [start, setStart] = useState("");
  const [duration, setDuration] = useState(60);
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!title.trim() || !start) return toast.error("Preenche o título e a data/hora da aula");
    const link = url.trim();
    if (link && !/^https?:\/\//i.test(link)) return toast.error("O link do Zoom tem de começar por https://");
    const startsAt = toIso(start);
    const endsAt = new Date(new Date(startsAt).getTime() + duration * 60000).toISOString();
    setSaving(true);
    const { error } = await supabase.from("zoom_lessons").insert({
      topic_id: topicId, title: title.trim(), zoom_url: link || null, starts_at: startsAt, ends_at: endsAt,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Aula marcada. Já aparece no calendário dos alunos.");
    setTitle(""); setUrl(""); setStart(""); setDuration(60); onChange();
  };

  const setLink = async (l: any) => {
    const next = prompt("Link do Zoom desta aula:", l.zoom_url ?? "");
    if (next === null) return;
    const link = next.trim();
    if (link && !/^https?:\/\//i.test(link)) return toast.error("O link do Zoom tem de começar por https://");
    const { error } = await supabase.from("zoom_lessons").update({ zoom_url: link || null }).eq("id", l.id);
    if (error) return toast.error(error.message);
    onChange();
  };

  return (
    <div>
      <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><Video className="h-4 w-4" /> Aulas Zoom</h4>
      <ul className="divide-y mb-3">
        {[...lessons].sort((a: any, b: any) => a.starts_at.localeCompare(b.starts_at)).map((l: any) => (
          <li key={l.id} className="py-2 flex justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{l.title}</p>
              <p className="text-xs text-muted-foreground">
                {fmt(l.starts_at)}{l.ends_at ? ` – ${fmtTime(l.ends_at)}` : ""}
              </p>
              {l.zoom_url ? (
                <a href={l.zoom_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> Abrir link do Zoom
                </a>
              ) : (
                <span className="text-xs text-amber-600">Sem link do Zoom</span>
              )}
            </div>
            <div className="flex items-start gap-1 shrink-0">
              <button onClick={() => setLink(l)} className="text-xs text-primary px-1">{l.zoom_url ? "Mudar link" : "Pôr link"}</button>
              <button onClick={() => removeRow("zoom_lessons", l.id, "Eliminar esta aula?", onChange)}
                className="text-destructive hover:bg-destructive/10 p-1 rounded" aria-label="Eliminar aula"><Trash2 className="h-4 w-4" /></button>
            </div>
          </li>
        ))}
        {lessons.length === 0 && <li className="py-2 text-xs text-muted-foreground">Sem aulas marcadas.</li>}
      </ul>
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2 items-end">
        <Field label="Título da aula"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Aula 1 — Introdução" className={inputCls} /></Field>
        <Field label="Data e hora (Maputo)"><input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} /></Field>
        <Field label="Duração">
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputCls}>
            {DURATIONS.map((d) => <option key={d} value={d}>{d >= 60 ? `${d / 60} h${d % 60 ? ` ${d % 60} min` : ""}` : `${d} min`}</option>)}
          </select>
        </Field>
        <Field label="Link do Zoom"><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://zoom.us/j/..." className={inputCls} /></Field>
        <button onClick={add} disabled={saving} className={`${btnCls} disabled:opacity-50`}>{saving ? "A guardar…" : "Marcar aula"}</button>
      </div>
    </div>
  );
}

/* ---------------- MATERIALS ---------------- */
function MaterialsBlock({ topicId, materials, onChange }: any) {
  const [title, setTitle] = useState(""); const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const upload = async () => {
    if (!file) return toast.error("Escolhe o ficheiro");
    setBusy(true);
    try {
      const { path, url } = await uploadToMaterials(topicId, file);
      const { error } = await supabase.from("lesson_materials").insert({
        topic_id: topicId, title: title.trim() || file.name, file_path: path, file_url: url,
      });
      if (error) {
        await supabase.storage.from("course-materials").remove([path]);
        throw error;
      }
      setTitle(""); setFile(null); onChange();
      toast.success("Ficheiro carregado");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao carregar o ficheiro");
    } finally { setBusy(false); }
  };
  return (
    <div>
      <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><FileText className="h-4 w-4" /> Ficheiros e materiais</h4>
      <ul className="divide-y mb-3">
        {materials.map((m: any) => (
          <li key={m.id} className="py-2 flex justify-between text-sm">
            <a href={m.file_url ?? "#"} target="_blank" rel="noreferrer" className="hover:text-primary">{m.title}</a>
            <button onClick={async () => {
              if (!confirm("Eliminar este ficheiro?")) return;
              if (m.file_path) await supabase.storage.from("course-materials").remove([m.file_path]);
              const { error } = await supabase.from("lesson_materials").delete().eq("id", m.id);
              if (error) return toast.error(error.message);
              onChange();
            }} className="text-destructive hover:bg-destructive/10 p-1 rounded" aria-label="Eliminar ficheiro"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
        {materials.length === 0 && <li className="py-2 text-xs text-muted-foreground">Sem ficheiros.</li>}
      </ul>
      <div className="grid sm:grid-cols-3 gap-2 items-end">
        <Field label="Título (opcional)"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Slides da aula 1" className={inputCls} /></Field>
        <Field label="Ficheiro"><input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm w-full" /></Field>
        <button onClick={upload} disabled={busy} className={`${btnCls} disabled:opacity-50`}><Upload className="h-4 w-4 inline mr-1" />{busy ? "A carregar…" : "Carregar"}</button>
      </div>
    </div>
  );
}

/* ---------------- QUIZZES ---------------- */
function QuizzesBlock({ topicId, quizzes, onChange }: any) {
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [opens, setOpens] = useState(""); const [closes, setCloses] = useState("");
  const [limit, setLimit] = useState(""); const [attempts, setAttempts] = useState("1");
  const [editing, setEditing] = useState<string | null>(null);

  const add = async () => {
    if (!title.trim()) return toast.error("Dá um título ao teste");
    if (opens && closes && toIso(closes) <= toIso(opens)) return toast.error("O teste tem de fechar depois de abrir");
    const n = Math.max(1, Math.floor(Number(attempts) || 1));
    const { error } = await supabase.from("quizzes").insert({
      topic_id: topicId,
      title: title.trim(),
      description: desc.trim() || null,
      opens_at: opens ? toIso(opens) : null,
      closes_at: closes ? toIso(closes) : null,
      time_limit_minutes: limit ? Math.max(1, Math.floor(Number(limit))) : null,
      attempts_allowed: n,
    });
    if (error) return toast.error(error.message);
    toast.success("Teste criado. Adiciona agora as perguntas.");
    setTitle(""); setDesc(""); setOpens(""); setCloses(""); setLimit(""); setAttempts("1"); onChange();
  };

  return (
    <div>
      <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><ClipboardList className="h-4 w-4" /> Testes</h4>
      <ul className="divide-y mb-3">
        {quizzes.map((q: any) => (
          <li key={q.id} className="py-2">
            <div className="flex justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{q.title} <span className="text-xs text-muted-foreground">({q.questions?.length || 0} perguntas)</span></p>
                <p className="text-xs text-muted-foreground">
                  {q.opens_at ? `Abre ${fmt(q.opens_at)}` : "Aberto já"} · {q.closes_at ? `Fecha ${fmt(q.closes_at)}` : "sem prazo"}
                  {q.time_limit_minutes ? ` · ${q.time_limit_minutes} min` : ""} · {q.attempts_allowed ?? 1} tentativa(s)
                </p>
                {(q.questions?.length ?? 0) === 0 && <p className="text-xs text-amber-600">Sem perguntas — os alunos não conseguem fazer o teste.</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setEditing(editing === q.id ? null : q.id)} className="text-xs text-primary">{editing === q.id ? "Fechar" : "Editar perguntas"}</button>
                <button onClick={() => removeRow("quizzes", q.id, "Eliminar este teste e as suas perguntas?", onChange)}
                  className="text-destructive hover:bg-destructive/10 p-1 rounded" aria-label="Eliminar teste"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            {editing === q.id && <QuestionsEditor quizId={q.id} questions={[...(q.questions || [])].sort((a: any, b: any) => a.position - b.position)} onChange={onChange} />}
          </li>
        ))}
        {quizzes.length === 0 && <li className="py-2 text-xs text-muted-foreground">Sem testes.</li>}
      </ul>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 items-end">
        <Field label="Título do teste"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Teste 1" className={inputCls} /></Field>
        <Field label="Instruções (opcional)"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="O que o aluno deve saber" className={inputCls} /></Field>
        <Field label="Abre em (Maputo)"><input type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} className={inputCls} /></Field>
        <Field label="Fecha em (Maputo)"><input type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} className={inputCls} /></Field>
        <Field label="Tempo limite (min, opcional)"><input type="number" min={1} value={limit} onChange={(e) => setLimit(e.target.value)} className={inputCls} /></Field>
        <Field label="Tentativas permitidas"><input type="number" min={1} value={attempts} onChange={(e) => setAttempts(e.target.value)} className={inputCls} /></Field>
        <button onClick={add} className={`${btnCls} sm:col-span-2 lg:col-span-3`}>Criar teste</button>
      </div>
    </div>
  );
}

function QuestionsEditor({ quizId, questions, onChange }: any) {
  const [text, setText] = useState(""); const [opts, setOpts] = useState(["", "", "", ""]); const [correct, setCorrect] = useState(0);
  const add = async () => {
    if (!text.trim()) return toast.error("Escreve o enunciado da pergunta");
    // Mantém o índice certo mesmo que haja opções vazias pelo meio
    const kept = opts.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
    if (kept.length < 2) return toast.error("Preenche pelo menos 2 opções");
    const newCorrect = kept.findIndex((x) => x.i === correct);
    if (newCorrect < 0) return toast.error("A opção marcada como correcta está vazia");
    const { error } = await supabase.from("questions").insert({
      quiz_id: quizId, text: text.trim(), options: kept.map((x) => x.o), correct_index: newCorrect, position: questions.length,
    });
    if (error) return toast.error(error.message);
    setText(""); setOpts(["", "", "", ""]); setCorrect(0); onChange();
  };
  return (
    <div className="mt-3 rounded border bg-secondary/30 p-3 space-y-3">
      <ol className="space-y-1 text-sm">
        {questions.map((q: any, i: number) => (
          <li key={q.id} className="flex justify-between gap-2 border-b pb-1">
            <span>{i + 1}. {q.text} <span className="text-xs text-muted-foreground">(resposta: {(q.options as any[])[q.correct_index]})</span></span>
            <button onClick={() => removeRow("questions", q.id, "Eliminar esta pergunta?", onChange)} className="text-destructive" aria-label="Eliminar pergunta"><Trash2 className="h-3 w-3" /></button>
          </li>
        ))}
        {questions.length === 0 && <li className="text-xs text-muted-foreground">Ainda sem perguntas.</li>}
      </ol>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Enunciado da pergunta" className={inputCls} />
      <p className="text-xs text-muted-foreground">Marca com o círculo a opção correcta.</p>
      {opts.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <input type="radio" checked={correct === i} onChange={() => setCorrect(i)} aria-label={`Opção ${i + 1} correcta`} />
          <input value={o} onChange={(e) => setOpts(opts.map((x, j) => j === i ? e.target.value : x))}
            placeholder={`Opção ${i + 1}`}
            className="flex-1 rounded border px-2 py-1 text-sm bg-background" />
        </div>
      ))}
      <button onClick={add} className="rounded bg-primary text-primary-foreground text-sm px-3 py-1">Adicionar pergunta</button>
    </div>
  );
}

/* ---------------- ASSIGNMENTS ---------------- */
function AssignmentsBlock({ topicId, assignments, onChange }: any) {
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState(""); const [due, setDue] = useState("");
  const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!title.trim()) return toast.error("Dá um título ao trabalho");
    if (!due) return toast.error("Define a data de entrega (aparece no calendário dos alunos)");
    setBusy(true);
    try {
      let supportUrl: string | null = null;
      let supportPath: string | null = null;
      if (file) {
        const up = await uploadToMaterials(topicId, file, "trabalhos/");
        supportUrl = up.url; supportPath = up.path;
      }
      const { error } = await supabase.from("assignments").insert({
        topic_id: topicId, title: title.trim(), description: desc.trim() || null, due_at: toIso(due), support_file_url: supportUrl,
      });
      if (error) {
        if (supportPath) await supabase.storage.from("course-materials").remove([supportPath]);
        throw error;
      }
      toast.success("Trabalho criado. Já aparece no calendário dos alunos.");
      setTitle(""); setDesc(""); setDue(""); setFile(null); onChange();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao criar o trabalho");
    } finally { setBusy(false); }
  };
  return (
    <div>
      <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><FileCheck2 className="h-4 w-4" /> Trabalhos</h4>
      <ul className="divide-y mb-3">
        {assignments.map((a: any) => (
          <li key={a.id} className="py-2 flex justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{a.title}</p>
              <p className="text-xs text-muted-foreground">Entrega até {a.due_at ? fmt(a.due_at) : "sem data"}</p>
              {a.description && <p className="text-xs text-muted-foreground">{a.description}</p>}
              {a.support_file_url && (
                <a href={a.support_file_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1">
                  <Paperclip className="h-3 w-3" /> Ficheiro de apoio
                </a>
              )}
            </div>
            <button onClick={() => removeRow("assignments", a.id, "Eliminar este trabalho e as entregas dos alunos?", onChange)}
              className="text-destructive hover:bg-destructive/10 p-1 rounded shrink-0 self-start" aria-label="Eliminar trabalho"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
        {assignments.length === 0 && <li className="py-2 text-xs text-muted-foreground">Sem trabalhos.</li>}
      </ul>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 items-end">
        <Field label="Título"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Trabalho 1" className={inputCls} /></Field>
        <Field label="Descrição (opcional)"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="O que deve ser entregue" className={inputCls} /></Field>
        <Field label="Entrega até (Maputo)"><input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} /></Field>
        <Field label="Ficheiro de apoio (opcional)"><input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm w-full" /></Field>
        <button onClick={add} disabled={busy} className={`${btnCls} sm:col-span-2 disabled:opacity-50`}>{busy ? "A guardar…" : "Criar trabalho"}</button>
      </div>
    </div>
  );
}

/* ---------------- CALENDAR PANEL ---------------- */
const KIND_LABEL: Record<string, { label: string; cls: string }> = {
  aula: { label: "Aula", cls: "bg-blue-100 text-blue-700" },
  teste: { label: "Teste", cls: "bg-violet-100 text-violet-700" },
  trabalho: { label: "Trabalho", cls: "bg-amber-100 text-amber-700" },
  evento: { label: "Evento", cls: "bg-emerald-100 text-emerald-700" },
};

function CalendarPanel({ courseId, topics }: { courseId: string; topics: any[] }) {
  const { user } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [title, setTitle] = useState(""); const [type, setType] = useState("Evento");
  const [start, setStart] = useState(""); const [desc, setDesc] = useState("");
  const [showPast, setShowPast] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from("calendar_events").select("*").eq("course_id", courseId).order("starts_at");
    if (error) return toast.error(error.message);
    setEvents(data ?? []);
  };
  useEffect(() => { load(); }, [courseId]);

  const addEvent = async () => {
    if (!user) return;
    if (!title.trim() || !start) return toast.error("Preenche o título e a data/hora");
    const { error } = await supabase.from("calendar_events").insert({
      course_id: courseId, user_id: user.id, title: title.trim(), type, description: desc.trim() || null, starts_at: toIso(start),
    });
    if (error) return toast.error(error.message);
    toast.success("Evento adicionado ao calendário dos alunos");
    setTitle(""); setStart(""); setDesc(""); load();
  };

  const items = useMemo(() => {
    const all: { id: string; kind: string; title: string; at: string; extra?: string; link?: string | null; eventId?: string }[] = [];
    for (const t of topics) {
      for (const l of t.lessons || []) all.push({ id: `a-${l.id}`, kind: "aula", title: l.title, at: l.starts_at, extra: l.ends_at ? `até ${fmtTime(l.ends_at)}` : undefined, link: l.zoom_url });
      for (const q of t.quizzes || []) {
        if (q.opens_at) all.push({ id: `to-${q.id}`, kind: "teste", title: `${q.title} (abre)`, at: q.opens_at });
        if (q.closes_at) all.push({ id: `tc-${q.id}`, kind: "teste", title: `${q.title} (fecha)`, at: q.closes_at });
      }
      for (const a of t.assignments || []) if (a.due_at) all.push({ id: `w-${a.id}`, kind: "trabalho", title: `${a.title} (entrega)`, at: a.due_at });
    }
    for (const e of events) all.push({ id: `e-${e.id}`, kind: "evento", title: e.title, at: e.starts_at, extra: e.type ?? undefined, eventId: e.id });
    return all.sort((x, y) => x.at.localeCompare(y.at));
  }, [topics, events]);

  const today = dayKey(new Date().toISOString());
  const visible = items.filter((i) => showPast || dayKey(i.at) >= today);
  const groups: Record<string, typeof items> = {};
  for (const i of visible) (groups[dayKey(i.at)] ??= []).push(i);

  return (
    <div className="space-y-5">
      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Adicionar evento ao calendário</h3>
        <p className="text-xs text-muted-foreground">As aulas, testes e trabalhos aparecem aqui automaticamente. Usa isto para avisos extra (exame, reunião, entrega de notas…).</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 items-end">
          <Field label="Título"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Exame final" className={inputCls} /></Field>
          <Field label="Tipo">
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
              {["Evento", "Exame", "Reunião", "Aviso"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Data e hora (Maputo)"><input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} /></Field>
          <Field label="Notas (opcional)"><input value={desc} onChange={(e) => setDesc(e.target.value)} className={inputCls} /></Field>
          <button onClick={addEvent} className={`${btnCls} sm:col-span-2 lg:col-span-4`}>Adicionar ao calendário</button>
        </div>
      </section>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Agenda da disciplina (hora de Maputo)</h3>
        <label className="text-xs flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Mostrar passados
        </label>
      </div>

      {Object.keys(groups).length === 0 && <p className="text-sm text-muted-foreground">Sem eventos {showPast ? "" : "futuros "}nesta disciplina.</p>}

      {Object.entries(groups).map(([day, list]) => (
        <section key={day} className="rounded-lg border bg-card">
          <header className={`px-4 py-2 border-b bg-secondary/40 text-sm font-medium capitalize ${day === today ? "text-primary" : ""}`}>
            {fmtDay(day)}{day === today ? " · hoje" : ""}
          </header>
          <ul className="divide-y">
            {list.map((i) => {
              const k = KIND_LABEL[i.kind];
              return (
                <li key={i.id} className="px-4 py-2 flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground w-12 shrink-0">{fmtTime(i.at)}</span>
                    <span className={`text-[10px] uppercase tracking-wide font-medium rounded px-1.5 py-0.5 ${k.cls}`}>{k.label}</span>
                    <span className="truncate">{i.title}</span>
                    {i.extra && <span className="text-xs text-muted-foreground shrink-0">{i.extra}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {i.link && <a href={i.link} target="_blank" rel="noreferrer" className="text-primary" aria-label="Abrir Zoom"><ExternalLink className="h-4 w-4" /></a>}
                    {i.eventId && (
                      <button onClick={() => removeRow("calendar_events", i.eventId!, "Eliminar este evento?", load)}
                        className="text-destructive" aria-label="Eliminar evento"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ---------------- GRADES PANEL ---------------- */
function GradesPanel({ courseId, students }: any) {
  const [grades, setGrades] = useState<any[]>([]);
  const [item, setItem] = useState(""); const [weight, setWeight] = useState(""); const [studentId, setStudentId] = useState(""); const [grade, setGrade] = useState("");
  const refresh = async () => {
    const { data } = await supabase.from("grades").select("*, student:profiles(full_name,email)").eq("course_id", courseId).order("created_at");
    setGrades(data ?? []);
  };
  useEffect(() => { refresh(); }, [courseId]);
  const add = async () => {
    if (!item || !studentId || !weight) return toast.error("Preenche todos os campos");
    const g = grade ? Number(grade) : null;
    if (g !== null && (g < 0 || g > 20)) return toast.error("A nota tem de estar entre 0 e 20");
    const { error } = await supabase.from("grades").insert({
      course_id: courseId, student_id: studentId, item, weight: Number(weight), grade: g,
    });
    if (error) return toast.error(error.message);
    setItem(""); setWeight(""); setGrade(""); refresh();
  };
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 grid sm:grid-cols-5 gap-2">
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="rounded border px-2 py-1.5 text-sm bg-background">
          <option value="">Aluno…</option>
          {students.map((s: any) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
        </select>
        <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Item (ex: Teste 1)" className="rounded border px-2 py-1.5 text-sm bg-background" />
        <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Peso %" type="number" className="rounded border px-2 py-1.5 text-sm bg-background" />
        <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Nota 0–20" type="number" step="0.01" min="0" max="20" className="rounded border px-2 py-1.5 text-sm bg-background" />
        <button onClick={add} className="rounded bg-primary text-primary-foreground text-sm px-3"><Award className="h-4 w-4 inline mr-1" />Lançar</button>
      </div>
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50"><tr className="text-left"><th className="px-3 py-2">Aluno</th><th className="px-3 py-2">Item</th><th className="px-3 py-2">Peso</th><th className="px-3 py-2">Nota</th><th></th></tr></thead>
          <tbody>
            {grades.map((g) => (
              <tr key={g.id} className="border-t">
                <td className="px-3 py-2">{g.student?.full_name || g.student?.email}</td>
                <td className="px-3 py-2">{g.item}</td>
                <td className="px-3 py-2">{g.weight}%</td>
                <td className="px-3 py-2">{g.grade ?? "—"}</td>
                <td className="px-3 py-2 text-right"><button onClick={() => removeRow("grades", g.id, "Eliminar esta nota?", refresh)} className="text-destructive" aria-label="Eliminar nota"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
            {grades.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Sem notas lançadas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- ATTENDANCE PANEL ---------------- */
function AttendancePanel({ topics, students }: any) {
  const lessons = topics.flatMap((t: any) => (t.lessons || []).map((l: any) => ({ ...l, topicTitle: t.title })));
  const [lessonId, setLessonId] = useState("");
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!lessonId) return;
    (async () => {
      const { data } = await supabase.from("attendance").select("student_id, present").eq("lesson_id", lessonId);
      const m: Record<string, boolean> = {};
      (data ?? []).forEach((r: any) => { m[r.student_id] = r.present; });
      setMarks(m);
    })();
  }, [lessonId]);

  const toggle = async (sid: string) => {
    const next = !marks[sid];
    setMarks({ ...marks, [sid]: next });
    const { error } = await supabase.from("attendance").upsert({ lesson_id: lessonId, student_id: sid, present: next }, { onConflict: "lesson_id,student_id" } as any);
    if (error) {
      setMarks((m) => ({ ...m, [sid]: !next }));
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-4">
      <select value={lessonId} onChange={(e) => setLessonId(e.target.value)} className="rounded border px-3 py-2 text-sm bg-background max-w-full">
        <option value="">Selecciona uma aula…</option>
        {lessons.map((l: any) => <option key={l.id} value={l.id}>{l.topicTitle} — {l.title} ({fmt(l.starts_at)})</option>)}
      </select>
      {lessonId && (
        <div className="rounded-lg border bg-card divide-y">
          {students.map((s: any) => (
            <label key={s.id} className="px-4 py-2 flex items-center justify-between text-sm cursor-pointer hover:bg-accent/40">
              <span>{s.full_name || s.email}</span>
              <span className="flex items-center gap-2">
                <CheckSquare className={`h-4 w-4 ${marks[s.id] ? "text-primary" : "text-muted-foreground"}`} />
                <input type="checkbox" checked={!!marks[s.id]} onChange={() => toggle(s.id)} />
              </span>
            </label>
          ))}
          {students.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">Sem alunos inscritos.</p>}
        </div>
      )}
    </div>
  );
}
