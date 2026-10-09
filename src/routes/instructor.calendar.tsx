import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Video, ClipboardList, FileText, CalendarDays, ExternalLink, X, Calendar as CalIcon,
} from "lucide-react";

export const Route = createFileRoute("/instructor/calendar")({
  component: () => <RequireAuth allow={["instructor", "admin"]}><Page /></RequireAuth>,
});

// ── Fuso horário (Maputo, UTC+2, sem horário de verão) ──
const APP_TZ = "Africa/Maputo";
const tzFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function toAppTZ(iso: string) {
  const p: Record<string, string> = {};
  for (const part of tzFormatter.formatToParts(new Date(iso))) p[part.type] = part.value;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
const isoDate = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const firstDayOfWeek = (y: number, m: number) => (new Date(y, m, 1).getDay() + 6) % 7;
function weekdayIndex(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
const MONTH_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DAY_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

type Kind = "aula" | "teste" | "trabalho" | "evento";
const KIND: Record<Kind, { label: string; dot: string; badge: string; Icon: any }> = {
  aula:     { label: "Aula Zoom", dot: "bg-blue-500",    badge: "bg-blue-50 text-blue-700 border-blue-200",       Icon: Video },
  teste:    { label: "Teste",     dot: "bg-violet-500",  badge: "bg-violet-50 text-violet-700 border-violet-200", Icon: ClipboardList },
  trabalho: { label: "Trabalho",  dot: "bg-amber-500",   badge: "bg-amber-50 text-amber-700 border-amber-200",    Icon: FileText },
  evento:   { label: "Evento",    dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CalendarDays },
};

type Course = { id: string; code: string | null; name: string };
type Topic = { id: string; course_id: string; title: string };
type Ev = {
  key: string; rawId: string; kind: Kind; title: string; courseId: string | null; subject: string;
  date: string; time: string; endTime?: string; zoom_url?: string | null; description?: string | null;
};

function Page() {
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const nowTz = useMemo(() => toAppTZ(new Date().toISOString()), []);
  const [ty, tm] = nowTz.date.split("-").map(Number);
  const todayIso = nowTz.date;

  const [year, setYear] = useState(ty);
  const [month, setMonth] = useState(tm - 1);
  const [selected, setSelected] = useState<string>(todayIso);
  const [courses, setCourses] = useState<Course[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let cs: Course[] = [];
    if (isAdmin) {
      const { data } = await supabase.from("courses").select("id, code, name").order("name");
      cs = (data ?? []) as Course[];
    } else {
      const { data } = await supabase.from("instructor_courses").select("course:courses(id, code, name)").eq("instructor_id", user.id);
      cs = (data ?? []).map((x: any) => x.course).filter(Boolean) as Course[];
    }
    setCourses(cs);
    if (cs.length === 0) { setTopics([]); setEvents([]); setLoading(false); return; }

    const cids = cs.map((c) => c.id);
    const { data: tp } = await supabase.from("course_topics").select("id, course_id, title, position").in("course_id", cids).order("position");
    const tps = (tp ?? []) as Topic[];
    setTopics(tps);
    const tids = tps.map((t) => t.id);
    const topicCourse = new Map(tps.map((t) => [t.id, t.course_id]));
    const cName = new Map(cs.map((c) => [c.id, c.name]));
    const none = Promise.resolve({ data: [], error: null } as any);

    const [ls, qs, as, ev] = await Promise.all([
      tids.length ? supabase.from("zoom_lessons").select("id, title, starts_at, ends_at, zoom_url, topic_id").in("topic_id", tids) : none,
      tids.length ? supabase.from("quizzes").select("id, title, description, opens_at, closes_at, topic_id").in("topic_id", tids) : none,
      tids.length ? supabase.from("assignments").select("id, title, description, due_at, topic_id").in("topic_id", tids) : none,
      supabase.from("calendar_events").select("id, title, description, starts_at, ends_at, type, course_id, user_id")
        .or(`course_id.in.(${cids.join(",")}),user_id.eq.${user.id}`),
    ]);
    const failed = [ls, qs, as, ev].find((x: any) => x.error);
    if (failed?.error) toast.error(failed.error.message);

    const all: Ev[] = [];
    const sub = (topicId: string) => cName.get(topicCourse.get(topicId) ?? "") ?? "—";
    for (const l of (ls.data ?? []) as any[]) {
      const s = toAppTZ(l.starts_at);
      all.push({ key: `aula-${l.id}`, rawId: l.id, kind: "aula", title: l.title, courseId: topicCourse.get(l.topic_id) ?? null, subject: sub(l.topic_id), date: s.date, time: s.time, endTime: l.ends_at ? toAppTZ(l.ends_at).time : undefined, zoom_url: l.zoom_url });
    }
    for (const q of (qs.data ?? []) as any[]) {
      const when = q.closes_at ?? q.opens_at;
      if (!when) continue;
      const s = toAppTZ(when);
      all.push({ key: `teste-${q.id}`, rawId: q.id, kind: "teste", title: q.closes_at ? `${q.title} (fecha)` : `${q.title} (abre)`, courseId: topicCourse.get(q.topic_id) ?? null, subject: sub(q.topic_id), date: s.date, time: s.time, description: q.description });
    }
    for (const a of (as.data ?? []) as any[]) {
      if (!a.due_at) continue;
      const s = toAppTZ(a.due_at);
      all.push({ key: `trabalho-${a.id}`, rawId: a.id, kind: "trabalho", title: `${a.title} (entrega)`, courseId: topicCourse.get(a.topic_id) ?? null, subject: sub(a.topic_id), date: s.date, time: s.time, description: a.description });
    }
    for (const e of (ev.data ?? []) as any[]) {
      const s = toAppTZ(e.starts_at);
      all.push({ key: `evento-${e.id}`, rawId: e.id, kind: "evento", title: e.title, courseId: e.course_id, subject: e.course_id ? (cName.get(e.course_id) ?? "—") : "Pessoal", date: s.date, time: s.time, endTime: e.ends_at ? toAppTZ(e.ends_at).time : undefined, description: e.description });
    }
    setEvents(all);
    setLoading(false);
  }, [user, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => (filter ? events.filter((e) => e.courseId === filter) : events), [events, filter]);
  const byDate = useMemo(() => {
    const m: Record<string, Ev[]> = {};
    for (const e of visible) (m[e.date] ??= []).push(e);
    return m;
  }, [visible]);

  const prev = () => { if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1); };
  const next = () => { if (month === 11) { setYear((y) => y + 1); setMonth(0); } else setMonth((m) => m + 1); };
  const goToday = () => { setYear(ty); setMonth(tm - 1); setSelected(todayIso); };

  const total = daysInMonth(year, month);
  const cells: (number | null)[] = [...Array(firstDayOfWeek(year, month)).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const dayEvents = [...(byDate[selected] ?? [])].sort((a, b) => a.time.localeCompare(b.time));

  const remove = async (e: Ev) => {
    if (!confirm(`Eliminar "${e.title}"?`)) return;
    const table = e.kind === "aula" ? "zoom_lessons" : e.kind === "teste" ? "quizzes" : e.kind === "trabalho" ? "assignments" : "calendar_events";
    const { error } = await (supabase as any).from(table).delete().eq("id", e.rawId);
    if (error) return toast.error(error.message);
    toast.success("Eliminado.");
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><CalIcon className="h-6 w-6 text-primary" /> Calendário e agenda</h1>
          <p className="text-sm text-muted-foreground">Marque aulas Zoom, testes, prazos de trabalhos e eventos (hora de Maputo).</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} disabled={courses.length === 0 && !isAdmin}
          className="inline-flex items-center gap-2 rounded bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50">
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showForm ? "Fechar" : "Agendar"}
        </button>
      </div>

      {courses.length === 0 && !loading && (
        <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
          Ainda não tem disciplinas atribuídas. Peça ao administrador para o atribuir a uma disciplina para poder agendar aulas, testes e trabalhos.
        </div>
      )}

      {showForm && courses.length > 0 && (
        <ScheduleForm courses={courses} topics={topics} defaultDate={selected} userId={user!.id}
          onDone={() => { setShowForm(false); load(); }} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded border px-3 py-2 text-sm bg-background">
          <option value="">Todas as disciplinas</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={goToday} className="rounded border px-3 py-2 text-sm hover:bg-secondary">Hoje</button>
      </div>

      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="flex items-center justify-between px-3 sm:px-6 py-3 border-b">
          <button onClick={prev} className="p-2 rounded-lg hover:bg-secondary" aria-label="Mês anterior"><ChevronLeft size={18} /></button>
          <h2 className="text-base font-semibold">{MONTH_PT[month]} {year}</h2>
          <button onClick={next} className="p-2 rounded-lg hover:bg-secondary" aria-label="Próximo mês"><ChevronRight size={18} /></button>
        </div>
        <div className="grid grid-cols-7 border-b">
          {DAY_PT.map((d) => <div key={d} className="py-2 text-center text-[11px] sm:text-xs font-medium text-muted-foreground uppercase">{d}</div>)}
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">A carregar…</div>
        ) : (
          <div className="grid grid-cols-7">
            {cells.map((day, idx) => {
              if (day === null) return <div key={`e-${idx}`} className="h-14 sm:h-24 border-b border-r" />;
              const iso = isoDate(year, month, day);
              const list = byDate[iso] ?? [];
              return (
                <button key={iso} onClick={() => setSelected(iso)}
                  className={`h-14 sm:h-24 p-1 sm:p-1.5 border-b border-r text-left transition-colors ${iso === selected ? "bg-primary/10" : "hover:bg-secondary/50"}`}>
                  <span className={`inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full text-xs sm:text-sm font-medium ${iso === todayIso ? "bg-primary text-primary-foreground" : ""}`}>{day}</span>
                  {/* Telemóvel: pontos; ecrã maior: títulos */}
                  <div className="flex gap-0.5 mt-1 sm:hidden">
                    {list.slice(0, 4).map((e) => <span key={e.key} className={`w-1.5 h-1.5 rounded-full ${KIND[e.kind].dot}`} />)}
                  </div>
                  <div className="hidden sm:block space-y-0.5 overflow-hidden mt-1">
                    {list.slice(0, 2).map((e) => (
                      <div key={e.key} className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] truncate border ${KIND[e.kind].badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${KIND[e.kind].dot}`} /><span className="truncate">{e.title}</span>
                      </div>
                    ))}
                    {list.length > 2 && <div className="text-[11px] text-muted-foreground pl-1">+{list.length - 2} mais</div>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 border-t">
          {(Object.keys(KIND) as Kind[]).map((k) => (
            <div key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={`w-2 h-2 rounded-full ${KIND[k].dot}`} />{KIND[k].label}</div>
          ))}
        </div>
      </div>

      <section className="bg-card rounded-xl border">
        <header className="px-5 py-3 border-b">
          <p className="text-xs text-muted-foreground uppercase">{DAY_PT[weekdayIndex(selected)]}</p>
          <p className="font-semibold">{Number(selected.split("-")[2])} de {MONTH_PT[Number(selected.split("-")[1]) - 1]}</p>
        </header>
        <ul className="divide-y">
          {dayEvents.map((e) => {
            const K = KIND[e.kind];
            return (
              <li key={e.key} className="px-5 py-3 text-sm flex items-start justify-between gap-3">
                <div className="flex gap-3 min-w-0">
                  <span className={`mt-0.5 p-1.5 rounded border h-fit ${K.badge}`}><K.Icon size={14} /></span>
                  <div className="min-w-0">
                    <p className="font-medium">{e.title}</p>
                    <p className="text-xs text-muted-foreground">{K.label} · {e.subject} · {e.time}{e.endTime ? `–${e.endTime}` : ""}</p>
                    {e.description && <p className="text-xs text-muted-foreground mt-1">{e.description}</p>}
                    {e.zoom_url && (
                      <a href={e.zoom_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs bg-blue-600 text-white px-3 py-1.5 rounded">
                        <ExternalLink size={12} /> Abrir Zoom
                      </a>
                    )}
                  </div>
                </div>
                <button onClick={() => remove(e)} className="text-destructive hover:bg-destructive/10 p-1.5 rounded shrink-0" aria-label="Eliminar"><Trash2 className="h-4 w-4" /></button>
              </li>
            );
          })}
          {dayEvents.length === 0 && <li className="px-5 py-8 text-sm text-center text-muted-foreground">Sem eventos neste dia.</li>}
        </ul>
      </section>
    </div>
  );
}

/* ---------------- FORMULÁRIO DE AGENDAMENTO ---------------- */
function ScheduleForm({ courses, topics, defaultDate, userId, onDone }: { courses: Course[]; topics: Topic[]; defaultDate: string; userId: string; onDone: () => void }) {
  const [kind, setKind] = useState<Kind>("aula");
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [topicId, setTopicId] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("08:00");
  const [endTime, setEndTime] = useState("");
  const [zoomUrl, setZoomUrl] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const courseTopics = topics.filter((t) => t.course_id === courseId);
  useEffect(() => { setTopicId(courseTopics[0]?.id ?? ""); }, [courseId, topics.length]);

  const needsTopic = kind !== "evento";
  const timeLabel = kind === "trabalho" ? "Prazo de entrega (hora)" : kind === "teste" ? "Fecha às" : "Hora de início";

  const submit = async () => {
    if (!title.trim() || !date || !time) return toast.error("Preencha o título, a data e a hora.");
    if (needsTopic && !courseId) return toast.error("Escolha a disciplina.");
    if (kind === "aula" && zoomUrl && !/^https?:\/\//i.test(zoomUrl)) return toast.error("O link do Zoom deve começar por https://");
    const startISO = `${date}T${time}:00+02:00`;
    const endISO = endTime && (kind === "aula" || kind === "evento") ? `${date}T${endTime}:00+02:00` : null;
    if (endISO && new Date(endISO) <= new Date(startISO)) return toast.error("A hora de fim tem de ser depois do início.");

    setSaving(true);
    try {
      let tId = topicId;
      if (needsTopic && !tId) {
        // A disciplina ainda não tem tópicos: cria o tópico "Geral"
        const { data, error } = await supabase.from("course_topics").insert({ course_id: courseId, title: "Geral", position: 0 }).select("id").single();
        if (error) throw error;
        tId = data.id;
      }
      if (kind === "aula") {
        const { error } = await supabase.from("zoom_lessons").insert({ topic_id: tId, title: title.trim(), starts_at: startISO, ends_at: endISO, zoom_url: zoomUrl.trim() || null });
        if (error) throw error;
      } else if (kind === "trabalho") {
        const { error } = await supabase.from("assignments").insert({ topic_id: tId, title: title.trim(), description: description.trim() || null, due_at: startISO });
        if (error) throw error;
      } else if (kind === "teste") {
        const { error } = await supabase.from("quizzes").insert({ topic_id: tId, title: title.trim(), description: description.trim() || null, closes_at: startISO });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("calendar_events").insert({ user_id: userId, course_id: courseId || null, title: title.trim(), description: description.trim() || null, starts_at: startISO, ends_at: endISO, type: "Evento" });
        if (error) throw error;
      }
      toast.success(kind === "teste" ? "Teste criado. Adicione as perguntas na página da disciplina." : "Agendado com sucesso.");
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível guardar.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "rounded border px-3 py-2 text-sm bg-background w-full";
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(KIND) as Kind[]).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${kind === k ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}>
            {(() => { const I = KIND[k].Icon; return <I size={14} />; })()} {KIND[k].label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "aula" ? "Título da aula" : kind === "teste" ? "Título do teste" : kind === "trabalho" ? "Título do trabalho" : "Título do evento"} className={`${inputCls} sm:col-span-2`} />

        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={inputCls}>
          {kind === "evento" && <option value="">Sem disciplina (pessoal)</option>}
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {needsTopic && (
          courseTopics.length > 0 ? (
            <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className={inputCls}>
              {courseTopics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          ) : (
            <p className="text-xs text-muted-foreground self-center">Esta disciplina ainda não tem tópicos. Será criado o tópico "Geral".</p>
          )
        )}

        <label className="text-xs text-muted-foreground space-y-1">Data
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs text-muted-foreground space-y-1">{timeLabel}
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
        </label>

        {(kind === "aula" || kind === "evento") && (
          <label className="text-xs text-muted-foreground space-y-1">Hora de fim (opcional)
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} />
          </label>
        )}
        {kind === "aula" && (
          <label className="text-xs text-muted-foreground space-y-1">Link do Zoom
            <input value={zoomUrl} onChange={(e) => setZoomUrl(e.target.value)} placeholder="https://zoom.us/j/..." className={inputCls} />
          </label>
        )}
        {kind !== "aula" && (
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição (opcional)" rows={2} className={`${inputCls} sm:col-span-2`} />
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">Hora de Maputo. Os alunos inscritos veem isto no calendário deles.</p>
        <button onClick={submit} disabled={saving} className="rounded bg-primary text-primary-foreground px-5 py-2 text-sm disabled:opacity-50 shrink-0">{saving ? "A guardar…" : "Guardar"}</button>
      </div>
    </section>
  );
}
