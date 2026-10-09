import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Video, FileText, ClipboardList, FileCheck2, Trash2, Plus, Upload, CheckSquare, Award, Paperclip } from "lucide-react";

export const Route = createFileRoute("/instructor/courses/$id")({
  component: () => <RequireAuth allow={["instructor", "admin"]}><Page /></RequireAuth>,
});

// Fuso da instituição (Moçambique, UTC+2, sem horário de verão)
const APP_TZ = "Africa/Maputo";

function fmt(d?: string | null) {
  return d ? new Date(d).toLocaleString("pt-PT", { timeZone: APP_TZ }) : "";
}

// Converte o valor de um <input type="datetime-local"> para um instante ISO no fuso de Maputo.
// Sem isto a hora digitada seria gravada como UTC e apareceria 2 horas adiantada aos alunos.
function toMaputoISO(local: string): string | null {
  if (!local) return null;
  return local.length === 16 ? `${local}:00+02:00` : `${local}+02:00`;
}

// Nomes de ficheiro com acentos, espaços ou símbolos podem ser recusados pelo armazenamento
function safeName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\-]+/g, "_");
}

async function uploadCourseFile(topicId: string, file: File, prefix = "") {
  if (file.size > 50 * 1024 * 1024) throw new Error("O ficheiro é demasiado grande (máximo 50 MB).");
  const path = `${topicId}/${prefix}${Date.now()}-${safeName(file.name)}`;
  const { error: upErr } = await supabase.storage.from("course-materials").upload(path, file);
  if (upErr) throw upErr;
  const { data: signed } = await supabase.storage.from("course-materials").createSignedUrl(path, 60 * 60 * 24 * 365);
  return { path, url: signed?.signedUrl ?? null };
}

async function del(table: string, id: string, onDone: () => void) {
  const { error } = await (supabase as any).from(table).delete().eq("id", id);
  if (error) return toast.error(error.message);
  onDone();
}

function Page() {
  const { id } = Route.useParams();
  const [course, setCourse] = useState<any>(null);
  const [topics, setTopics] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [tab, setTab] = useState<"content" | "students" | "grades" | "attendance">("content");
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

  const delTopic = async (tid: string) => {
    if (!confirm("Eliminar tópico e todo o seu conteúdo?")) return;
    await del("course_topics", tid, refresh);
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
          <div className="rounded-lg border bg-card p-4 flex flex-wrap gap-2">
            <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)}
              placeholder="Novo tópico (ex: Tópico 1 — Introdução)"
              className="flex-1 min-w-48 rounded border px-3 py-2 text-sm bg-background" />
            <button onClick={addTopic} className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm">
              <Plus className="h-4 w-4 inline" /> Adicionar
            </button>
          </div>

          {topics.map((t, i) => (
            <TopicEditor key={t.id} topic={t} index={i} onChange={refresh} onDelete={() => delTopic(t.id)} />
          ))}
          {topics.length === 0 && <p className="text-muted-foreground text-sm">Sem tópicos. Cria o primeiro acima.</p>}
        </>
      )}

      {tab === "students" && (
        <section className="rounded-lg border bg-card divide-y">
          {students.map((s) => (
            <div key={s.id} className="px-4 py-3 flex flex-wrap justify-between gap-1 text-sm">
              <span>{s.full_name || "—"}</span>
              <span className="text-muted-foreground break-all">{s.email}</span>
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
        <button onClick={onDelete} className="text-destructive hover:bg-destructive/10 p-1 rounded"><Trash2 className="h-4 w-4" /></button>
      </header>
      <div className="p-5 space-y-5">
        <LessonsBlock topicId={topic.id} lessons={topic.lessons || []} onChange={onChange} />
        <MaterialsBlock topicId={topic.id} materials={topic.materials || []} onChange={onChange} />
        <QuizzesBlock topicId={topic.id} quizzes={topic.quizzes || []} onChange={onChange} />
        <AssignmentsBlock topicId={topic.id} assignments={topic.assignments || []} onChange={onChange} />
      </div>
    </section>
  );
}

/* ---------------- LESSONS ---------------- */
function LessonsBlock({ topicId, lessons, onChange }: any) {
  const [title, setTitle] = useState(""); const [url, setUrl] = useState(""); const [start, setStart] = useState("");
  const [duration, setDuration] = useState("60");
  const add = async () => {
    if (!title || !start) return toast.error("Preenche título e data");
    if (url && !/^https?:\/\//i.test(url)) return toast.error("O link do Zoom deve começar por https://");
    const startISO = toMaputoISO(start)!;
    const mins = Number(duration);
    const endISO = mins > 0 ? new Date(new Date(startISO).getTime() + mins * 60000).toISOString() : null;
    const { error } = await supabase.from("zoom_lessons").insert({ topic_id: topicId, title, zoom_url: url || null, starts_at: startISO, ends_at: endISO });
    if (error) return toast.error(error.message);
    setTitle(""); setUrl(""); setStart(""); setDuration("60"); onChange();
  };
  return (
    <div>
      <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><Video className="h-4 w-4" /> Aulas Zoom</h4>
      <ul className="divide-y mb-2">
        {lessons.map((l: any) => (
          <li key={l.id} className="py-2 flex justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{l.title}</p>
              <p className="text-xs text-muted-foreground">{fmt(l.starts_at)}{l.ends_at ? ` (${Math.round((new Date(l.ends_at).getTime() - new Date(l.starts_at).getTime()) / 60000)} min)` : ""}</p>
              {l.zoom_url && <a href={l.zoom_url} target="_blank" rel="noreferrer" className="text-xs text-primary">Abrir link do Zoom</a>}
            </div>
            <button onClick={() => del("zoom_lessons", l.id, onChange)}
              className="text-destructive hover:bg-destructive/10 p-1 rounded h-fit"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" className="rounded border px-2 py-1.5 text-sm bg-background" />
        <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="rounded border px-2 py-1.5 text-sm bg-background" />
        <input type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Duração (min)" className="rounded border px-2 py-1.5 text-sm bg-background" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link do Zoom (https://...)" className="rounded border px-2 py-1.5 text-sm bg-background" />
        <button onClick={add} className="rounded bg-primary text-primary-foreground text-sm px-3 py-1.5">Agendar aula</button>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1">Hora de Maputo. A aula aparece no calendário dos alunos.</p>
    </div>
  );
}

/* ---------------- MATERIALS ---------------- */
function MaterialsBlock({ topicId, materials, onChange }: any) {
  const [title, setTitle] = useState(""); const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const upload = async () => {
    if (!title || !file) return toast.error("Título e ficheiro obrigatórios");
    setBusy(true);
    try {
      const { path, url } = await uploadCourseFile(topicId, file);
      const { error } = await supabase.from("lesson_materials").insert({ topic_id: topicId, title, file_path: path, file_url: url });
      if (error) throw error;
      setTitle(""); setFile(null); onChange();
      toast.success("Material carregado.");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível carregar o ficheiro.");
    } finally { setBusy(false); }
  };
  return (
    <div>
      <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><FileText className="h-4 w-4" /> Materiais</h4>
      <ul className="divide-y mb-2">
        {materials.map((m: any) => (
          <li key={m.id} className="py-2 flex justify-between gap-3 text-sm">
            <a href={m.file_url} target="_blank" rel="noreferrer" className="hover:text-primary min-w-0 break-words">{m.title}</a>
            <button onClick={async () => {
              if (m.file_path) await supabase.storage.from("course-materials").remove([m.file_path]);
              await del("lesson_materials", m.id, onChange);
            }} className="text-destructive hover:bg-destructive/10 p-1 rounded h-fit"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
      <div className="grid sm:grid-cols-3 gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título do material" className="rounded border px-2 py-1.5 text-sm bg-background" />
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm min-w-0" />
        <button onClick={upload} disabled={busy} className="rounded bg-primary text-primary-foreground text-sm px-3 py-1.5 disabled:opacity-50"><Upload className="h-4 w-4 inline mr-1" />{busy ? "A carregar…" : "Carregar"}</button>
      </div>
    </div>
  );
}

/* ---------------- QUIZZES ---------------- */
function QuizzesBlock({ topicId, quizzes, onChange }: any) {
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [opens, setOpens] = useState(""); const [closes, setCloses] = useState("");
  const [attempts, setAttempts] = useState("1"); const [limit, setLimit] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const add = async () => {
    if (!title) return toast.error("Indique o título do teste.");
    if (opens && closes && new Date(toMaputoISO(closes)!) <= new Date(toMaputoISO(opens)!)) return toast.error("O fecho tem de ser depois da abertura.");
    const att = Math.max(1, Number(attempts) || 1);
    const lim = Number(limit);
    const { error } = await supabase.from("quizzes").insert({
      topic_id: topicId, title, description: desc || null,
      opens_at: toMaputoISO(opens), closes_at: toMaputoISO(closes),
      attempts_allowed: att, time_limit_minutes: lim > 0 ? lim : null,
    });
    if (error) return toast.error(error.message);
    setTitle(""); setDesc(""); setOpens(""); setCloses(""); setAttempts("1"); setLimit(""); onChange();
    toast.success("Teste criado. Adicione as perguntas em \"Editar perguntas\".");
  };
  return (
    <div>
      <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><ClipboardList className="h-4 w-4" /> Testes</h4>
      <ul className="divide-y mb-2">
        {quizzes.map((q: any) => (
          <li key={q.id} className="py-2">
            <div className="flex justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{q.title} <span className="text-xs text-muted-foreground">({q.questions?.length || 0} perguntas)</span></p>
                <p className="text-xs text-muted-foreground">
                  {q.opens_at ? `Abre ${fmt(q.opens_at)} · ` : ""}{q.closes_at ? `Fecha ${fmt(q.closes_at)}` : "Sem prazo"} · {q.attempts_allowed ?? 1} tentativa(s){q.time_limit_minutes ? ` · ${q.time_limit_minutes} min` : ""}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setEditing(editing === q.id ? null : q.id)} className="text-xs text-primary">{editing === q.id ? "Fechar" : "Editar perguntas"}</button>
                <button onClick={() => del("quizzes", q.id, onChange)} className="text-destructive hover:bg-destructive/10 p-1 rounded"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            {editing === q.id && <QuestionsEditor quizId={q.id} questions={q.questions || []} onChange={onChange} />}
          </li>
        ))}
      </ul>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título do teste" className="rounded border px-2 py-1.5 text-sm bg-background" />
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descrição / instruções (opcional)" className="rounded border px-2 py-1.5 text-sm bg-background lg:col-span-2" />
        <label className="text-[11px] text-muted-foreground">Abre em (opcional)
          <input type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm bg-background text-foreground" />
        </label>
        <label className="text-[11px] text-muted-foreground">Fecha em
          <input type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm bg-background text-foreground" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-muted-foreground">Tentativas
            <input type="number" min="1" value={attempts} onChange={(e) => setAttempts(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm bg-background text-foreground" />
          </label>
          <label className="text-[11px] text-muted-foreground">Tempo (min)
            <input type="number" min="0" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="—" className="w-full rounded border px-2 py-1.5 text-sm bg-background text-foreground" />
          </label>
        </div>
        <button onClick={add} className="rounded bg-primary text-primary-foreground text-sm px-3 py-1.5 sm:col-span-2 lg:col-span-3">Criar teste</button>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1">Prazos em hora de Maputo.</p>
    </div>
  );
}

function QuestionsEditor({ quizId, questions, onChange }: any) {
  const [text, setText] = useState(""); const [opts, setOpts] = useState(["", "", "", ""]); const [correct, setCorrect] = useState(0);
  const add = async () => {
    const filled = opts.map((o) => o.trim()).filter(Boolean);
    if (!text.trim() || filled.length < 2) return toast.error("Pergunta e pelo menos 2 opções");
    if (!opts[correct].trim()) return toast.error("A opção marcada como correta está vazia");
    // O índice correto tem de ser calculado depois de remover as opções vazias
    const correctIndex = opts.slice(0, correct).filter((o) => o.trim()).length;
    const { error } = await supabase.from("questions").insert({
      quiz_id: quizId, text: text.trim(), options: filled, correct_index: correctIndex, position: questions.length,
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
            <button onClick={() => del("questions", q.id, onChange)} className="text-destructive"><Trash2 className="h-3 w-3" /></button>
          </li>
        ))}
      </ol>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Enunciado da pergunta" className="w-full rounded border px-2 py-1.5 text-sm bg-background" />
      {opts.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <input type="radio" checked={correct === i} onChange={() => setCorrect(i)} aria-label={`Opção ${i + 1} é a correta`} />
          <input value={o} onChange={(e) => setOpts(opts.map((x, j) => j === i ? e.target.value : x))}
            placeholder={`Opção ${i + 1}${i === correct ? " (correta)" : ""}`}
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
    if (!title) return toast.error("Indique o título do trabalho.");
    setBusy(true);
    try {
      let supportUrl: string | null = null;
      if (file) supportUrl = (await uploadCourseFile(topicId, file, "trabalho-")).url;
      const { error } = await supabase.from("assignments").insert({
        topic_id: topicId, title, description: desc || null, due_at: toMaputoISO(due), support_file_url: supportUrl,
      });
      if (error) throw error;
      setTitle(""); setDesc(""); setDue(""); setFile(null); onChange();
      toast.success("Trabalho criado. O prazo aparece no calendário dos alunos.");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível criar o trabalho.");
    } finally { setBusy(false); }
  };
  return (
    <div>
      <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><FileCheck2 className="h-4 w-4" /> Trabalhos</h4>
      <ul className="divide-y mb-2">
        {assignments.map((a: any) => (
          <li key={a.id} className="py-2 flex justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{a.title}</p>
              <p className="text-xs text-muted-foreground">{a.due_at ? `Entrega até ${fmt(a.due_at)}` : "Sem prazo"}</p>
              {a.support_file_url && <a href={a.support_file_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1"><Paperclip className="h-3 w-3" /> Ficheiro de apoio</a>}
            </div>
            <button onClick={() => del("assignments", a.id, onChange)} className="text-destructive hover:bg-destructive/10 p-1 rounded h-fit"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
      <div className="grid sm:grid-cols-2 gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" className="rounded border px-2 py-1.5 text-sm bg-background" />
        <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="rounded border px-2 py-1.5 text-sm bg-background" />
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descrição / enunciado" className="rounded border px-2 py-1.5 text-sm bg-background sm:col-span-2" />
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm min-w-0" />
        <button onClick={add} disabled={busy} className="rounded bg-primary text-primary-foreground text-sm px-3 py-1.5 disabled:opacity-50">{busy ? "A criar…" : "Criar trabalho"}</button>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1">Prazo em hora de Maputo. O ficheiro de apoio é opcional.</p>
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
    const w = Number(weight);
    if (!(w > 0 && w <= 100)) return toast.error("O peso deve estar entre 0 e 100%");
    if (grade !== "") {
      const g = Number(grade);
      if (!(g >= 0 && g <= 20)) return toast.error("A nota deve estar entre 0 e 20");
    }
    const { error } = await supabase.from("grades").insert({
      course_id: courseId, student_id: studentId, item, weight: w, grade: grade !== "" ? Number(grade) : null,
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
        <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Peso %" type="number" min="0" max="100" className="rounded border px-2 py-1.5 text-sm bg-background" />
        <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Nota 0–20" type="number" step="0.01" min="0" max="20" className="rounded border px-2 py-1.5 text-sm bg-background" />
        <button onClick={add} className="rounded bg-primary text-primary-foreground text-sm px-3 py-1.5"><Award className="h-4 w-4 inline mr-1" />Lançar</button>
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
                <td className="px-3 py-2 text-right"><button onClick={() => { if (confirm("Eliminar esta nota?")) del("grades", g.id, refresh); }} className="text-destructive"><Trash2 className="h-4 w-4" /></button></td>
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
    const prev = !!marks[sid];
    setMarks({ ...marks, [sid]: !prev });
    const { error } = await supabase.from("attendance").upsert({ lesson_id: lessonId, student_id: sid, present: !prev }, { onConflict: "lesson_id,student_id" } as any);
    if (error) {
      // Desfaz a marcação se a gravação falhar
      setMarks((m) => ({ ...m, [sid]: prev }));
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
