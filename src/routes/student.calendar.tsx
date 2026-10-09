import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, primaryRole } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, ArrowRight, BookOpen, ClipboardList, FileText, CalendarDays,
  ExternalLink, Clock, Download, Plus, Trash2, X,
} from "lucide-react";

export const Route = createFileRoute("/student/calendar")({
  component: () => <RequireAuth allow={["student", "instructor", "admin"]}><Page /></RequireAuth>,
});

// ─── Tipos ───────────────────────────────────────────────────────────────────

type EventKind = "aula" | "teste" | "trabalho" | "evento";

interface CalendarEvent {
  id: string;
  rawId: string;
  kind: EventKind;
  title: string;
  subject: string;
  courseId: string | null;
  date: string;          // yyyy-mm-dd (fuso da instituição)
  time?: string;         // HH:MM (fuso da instituição)
  startIso: string;      // instante original (para exportação)
  endIso?: string | null;
  duration?: number;
  zoom_url?: string | null;
  description?: string | null;
  own?: boolean;         // evento criado pelo próprio utilizador
}

type CourseOpt = { id: string; name: string };
type CourseRef = { course_id: string | null; course: { name: string } | null } | null;

// ─── Fuso horário ────────────────────────────────────────────────────────────

// Moçambique (UTC+2, sem horário de verão).
const APP_TZ = "Africa/Maputo";
const APP_OFFSET = "+02:00";

const tzFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function toAppTZ(iso: string) {
  const p: Record<string, string> = {};
  for (const part of tzFormatter.formatToParts(new Date(iso))) p[part.type] = part.value;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

function todayInAppTZ() {
  const { date } = toAppTZ(new Date().toISOString());
  const [y, m, d] = date.split("-").map(Number);
  return { year: y, month: m - 1, day: d };
}

// ─── Utilitários de calendário (semana começa ao Domingo, como no Moodle) ────

const MONTH_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const DAY_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const firstDayOfWeek = (y: number, m: number) => new Date(y, m, 1).getDay(); // Dom=0
const weekdayIndex = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

function shiftMonth(y: number, m: number, delta: number) {
  const t = y * 12 + m + delta;
  return { year: Math.floor(t / 12), month: ((t % 12) + 12) % 12 };
}

function monthCells(y: number, m: number) {
  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek(y, m)).fill(null),
    ...Array.from({ length: daysInMonth(y, m) }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatLong(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${DAY_PT[weekdayIndex(iso)]}, ${d} de ${MONTH_PT[m - 1]} de ${y}`;
}

const KIND_META: Record<EventKind, { label: string; color: string; bg: string; dot: string; Icon: typeof BookOpen }> = {
  aula:     { label: "Aula",     color: "text-blue-600",    bg: "bg-blue-50 border-blue-200",       dot: "bg-blue-500",    Icon: BookOpen },
  teste:    { label: "Teste",    color: "text-violet-600",  bg: "bg-violet-50 border-violet-200",   dot: "bg-violet-500",  Icon: ClipboardList },
  trabalho: { label: "Trabalho", color: "text-amber-600",   bg: "bg-amber-50 border-amber-200",     dot: "bg-amber-500",  Icon: FileText },
  evento:   { label: "Evento",   color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500", Icon: CalendarDays },
};

// ─── Exportar calendário (.ics) ─────────────────────────────────────────────

const icsEscape = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function exportIcs(events: CalendarEvent[]) {
  const stamp = icsDate(new Date());
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//IDF Digital Campus//Calendario//PT", "CALSCALE:GREGORIAN",
  ];
  for (const ev of events) {
    const start = new Date(ev.startIso);
    const end = ev.endIso ? new Date(ev.endIso) : new Date(start.getTime() + 60 * 60000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${ev.id}@idf-digital-campus`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(`${ev.title}${ev.subject && ev.subject !== "—" ? ` (${ev.subject})` : ""}`)}`,
      `CATEGORIES:${icsEscape(KIND_META[ev.kind].label)}`,
    );
    if (ev.description) lines.push(`DESCRIPTION:${icsEscape(ev.description)}`);
    if (ev.zoom_url) lines.push(`URL:${ev.zoom_url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "calendario-idf.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Mini calendário (vista de vários meses) ────────────────────────────────

function MiniMonth({
  year, month, byDate, todayIso, selected, onPick,
}: {
  year: number; month: number; byDate: Record<string, CalendarEvent[]>;
  todayIso: string; selected: string | null; onPick: (iso: string) => void;
}) {
  return (
    <div>
      <h3 className="text-center text-xl text-muted-foreground mb-3">{MONTH_PT[month]} de {year}</h3>
      <div className="grid grid-cols-7 text-center text-sm">
        {DAY_PT.map((d) => <div key={d} className="py-1.5 text-muted-foreground">{d}</div>)}
        {monthCells(year, month).map((day, i) => {
          if (day === null) return <div key={`e${i}`} className="py-2" />;
          const iso = isoDate(year, month, day);
          const has = (byDate[iso]?.length ?? 0) > 0;
          const isToday = iso === todayIso;
          return (
            <button
              key={iso}
              onClick={() => onPick(iso)}
              className={`py-2 text-sm ${
                isToday ? "bg-red-500 text-white font-semibold"
                : has ? "bg-orange-200 text-blue-800"
                : "text-muted-foreground hover:bg-secondary"
              } ${selected === iso ? "ring-2 ring-primary ring-inset" : ""}`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────

function Page() {
  const { user, roles } = useAuth();
  const role = primaryRole(roles);

  const today = useMemo(() => todayInAppTZ(), []);
  const todayIso = isoDate(today.year, today.month, today.day);

  const [viewYear, setViewYear] = useState(today.year);
  const [viewMonth, setViewMonth] = useState(today.month);
  const [view, setView] = useState<"month" | "upcoming">("month");
  const [courseFilter, setCourseFilter] = useState("");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [courses, setCourses] = useState<CourseOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  // ── Carregar disciplinas + eventos (RLS limita ao que o utilizador pode ver) ──

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const topic = "topic:course_topics(course_id, course:courses(name))";
      const [lessonsRes, quizzesRes, assignRes, eventsRes, coursesRes] = await Promise.all([
        supabase.from("zoom_lessons").select(`id, title, starts_at, ends_at, zoom_url, ${topic}`),
        supabase.from("quizzes").select(`id, title, description, opens_at, closes_at, ${topic}`),
        supabase.from("assignments").select(`id, title, description, due_at, ${topic}`).not("due_at", "is", null),
        supabase.from("calendar_events").select("id, user_id, course_id, title, description, starts_at, ends_at, type, course:courses(name)"),
        role === "student"
          ? supabase.from("enrollments").select("course:courses(id, name)").eq("student_id", user.id)
          : supabase.from("courses").select("id, name"),
      ]);

      for (const r of [lessonsRes, quizzesRes, assignRes, eventsRes, coursesRes]) {
        if (r.error) throw r.error;
      }

      const courseList: CourseOpt[] = (coursesRes.data ?? [])
        .map((r: any) => (role === "student" ? r.course : r))
        .filter(Boolean);
      courseList.sort((a, b) => a.name.localeCompare(b.name, "pt"));
      setCourses(courseList);

      const all: CalendarEvent[] = [];

      for (const l of (lessonsRes.data ?? []) as any[]) {
        const { date, time } = toAppTZ(l.starts_at);
        const t = l.topic as CourseRef;
        all.push({
          id: `aula-${l.id}`, rawId: l.id, kind: "aula", title: l.title,
          subject: t?.course?.name ?? "—", courseId: t?.course_id ?? null,
          date, time, startIso: l.starts_at, endIso: l.ends_at,
          duration: l.ends_at ? Math.round((new Date(l.ends_at).getTime() - new Date(l.starts_at).getTime()) / 60000) : undefined,
          zoom_url: l.zoom_url,
        });
      }

      for (const q of (quizzesRes.data ?? []) as any[]) {
        const when = q.closes_at ?? q.opens_at;
        if (!when) continue;
        const { date, time } = toAppTZ(when);
        const t = q.topic as CourseRef;
        all.push({
          id: `teste-${q.id}`, rawId: q.id, kind: "teste",
          title: q.closes_at ? q.title : `${q.title} (abre)`,
          subject: t?.course?.name ?? "—", courseId: t?.course_id ?? null,
          date, time, startIso: when, description: q.description,
        });
      }

      for (const a of (assignRes.data ?? []) as any[]) {
        const { date, time } = toAppTZ(a.due_at);
        const t = a.topic as CourseRef;
        all.push({
          id: `trabalho-${a.id}`, rawId: a.id, kind: "trabalho", title: a.title,
          subject: t?.course?.name ?? "—", courseId: t?.course_id ?? null,
          date, time, startIso: a.due_at, description: a.description,
        });
      }

      for (const e of (eventsRes.data ?? []) as any[]) {
        const { date, time } = toAppTZ(e.starts_at);
        all.push({
          id: `evento-${e.id}`, rawId: e.id, kind: "evento", title: e.title,
          subject: e.course?.name ?? (e.type === "personal" ? "Pessoal" : e.type ?? "Evento"),
          courseId: e.course_id ?? null,
          date, time, startIso: e.starts_at, endIso: e.ends_at, description: e.description,
          own: e.user_id === user.id,
        });
      }

      setEvents(all);
    } catch (err) {
      console.error("Erro ao carregar calendário:", err);
      toast.error("Não foi possível carregar o calendário.");
    } finally {
      setLoading(false);
    }
  }, [user, role]);

  useEffect(() => { load(); }, [load]);

  // ── Filtro por disciplina e índice por data ──────────────────────────────

  const filtered = useMemo(
    () => (courseFilter ? events.filter((e) => e.courseId === courseFilter) : events),
    [events, courseFilter],
  );

  const byDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of filtered) (map[ev.date] ??= []).push(ev);
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
    return map;
  }, [filtered]);

  const upcoming = useMemo(
    () => [...filtered]
      .filter((e) => e.date >= todayIso)
      .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? ""))),
    [filtered, todayIso],
  );

  // ── Navegação ────────────────────────────────────────────────────────────

  const go = (delta: number) => {
    const n = shiftMonth(viewYear, viewMonth, delta);
    setViewYear(n.year); setViewMonth(n.month); setSelected(null);
  };
  const prev = shiftMonth(viewYear, viewMonth, -1);
  const next = shiftMonth(viewYear, viewMonth, 1);

  const pickMini = (iso: string) => {
    const [y, m] = iso.split("-").map(Number);
    setViewYear(y); setViewMonth(m - 1); setSelected(iso);
    setView("month");
  };

  // ── Novo evento ──────────────────────────────────────────────────────────

  const [form, setForm] = useState({ title: "", date: todayIso, time: "08:00", course_id: "", description: "" });
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setForm({ title: "", date: selected ?? todayIso, time: "08:00", course_id: courseFilter, description: "" });
    setShowNew(true);
  };

  const saveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.title.trim() || !form.date) { toast.error("Indique o título e a data."); return; }
    setSaving(true);
    const { error } = await supabase.from("calendar_events").insert({
      user_id: user.id,
      course_id: form.course_id || null,
      title: form.title.trim(),
      description: form.description.trim() || null,
      starts_at: new Date(`${form.date}T${form.time || "00:00"}:00${APP_OFFSET}`).toISOString(),
      type: "personal",
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Evento criado.");
    setShowNew(false);
    setSelected(form.date);
    load();
  };

  const removeEvent = async (ev: CalendarEvent) => {
    if (!window.confirm(`Eliminar o evento "${ev.title}"?`)) return;
    const { error } = await supabase.from("calendar_events").delete().eq("id", ev.rawId);
    if (error) { toast.error(error.message); return; }
    toast.success("Evento eliminado.");
    load();
  };

  // ── Grelha do mês ───────────────────────────────────────────────────────

  const cells = monthCells(viewYear, viewMonth);
  const selectedEvents = selected ? byDate[selected] ?? [] : [];

  const EventCard = ({ ev }: { ev: CalendarEvent }) => {
    const meta = KIND_META[ev.kind];
    const Icon = meta.Icon;
    return (
      <div className={`rounded-lg border p-3 ${meta.bg}`}>
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 p-1.5 rounded-md bg-white shadow-sm ${meta.color}`}><Icon size={14} /></div>
          <div className="flex-1 min-w-0">
            <span className={`text-xs font-medium uppercase tracking-wide ${meta.color}`}>{meta.label}</span>
            <p className="font-semibold text-gray-900 text-sm leading-snug">{ev.title}</p>
            <p className="text-xs text-gray-500">{ev.subject}</p>
            {ev.time && (
              <p className="flex items-center gap-1.5 text-xs text-gray-600 mt-1">
                <Clock size={12} />{ev.time}{ev.duration ? ` · ${ev.duration} min` : ""}
              </p>
            )}
            {ev.description && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{ev.description}</p>}
            {ev.zoom_url && (
              <a href={ev.zoom_url} target="_blank" rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md">
                <ExternalLink size={12} /> Entrar na aula
              </a>
            )}
          </div>
          {ev.own && (
            <button onClick={() => removeEvent(ev)} className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-white" aria-label="Eliminar evento">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold text-primary">Calendário</h1>

      {/* Controlos: vista, disciplina, novo evento */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={view}
          onChange={(e) => setView(e.target.value as "month" | "upcoming")}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm uppercase tracking-wide sm:w-44"
          aria-label="Vista"
        >
          <option value="month">Mês</option>
          <option value="upcoming">Próximos eventos</option>
        </select>
        <select
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm sm:flex-1 sm:max-w-md"
          aria-label="Filtrar por disciplina"
        >
          <option value="">Todas as disciplinas</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Button onClick={openNew} className="uppercase tracking-wide sm:ml-auto">
          <Plus className="h-4 w-4 mr-1" /> Novo evento
        </Button>
      </div>

      {view === "month" ? (
        <>
          {/* Navegação entre meses */}
          <div className="flex items-start justify-between gap-2">
            <button onClick={() => go(-1)} className="text-sm text-primary hover:underline text-left flex items-start gap-1.5 max-w-[30%]">
              <ArrowLeft className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{MONTH_PT[prev.month]} de {prev.year}</span>
            </button>
            <h2 className="text-2xl sm:text-3xl text-center font-semibold text-red-700 leading-tight">
              {MONTH_PT[viewMonth]} de {viewYear}
            </h2>
            <button onClick={() => go(1)} className="text-sm text-primary hover:underline text-right flex items-start justify-end gap-1.5 max-w-[30%]">
              <span>{MONTH_PT[next.month]} de {next.year}</span>
              <ArrowRight className="h-4 w-4 mt-0.5 shrink-0" />
            </button>
          </div>

          {/* Grelha */}
          <div className="bg-card border overflow-hidden">
            <div className="grid grid-cols-7 border-b bg-secondary/30">
              {DAY_PT.map((d) => (
                <div key={d} className="py-2 text-center text-sm font-semibold">{d}</div>
              ))}
            </div>
            {loading ? (
              <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">A carregar eventos…</div>
            ) : (
              <div className="grid grid-cols-7">
                {cells.map((day, idx) => {
                  if (day === null) return <div key={`e${idx}`} className="h-16 sm:h-24 border-b border-r border-dashed" />;
                  const iso = isoDate(viewYear, viewMonth, day);
                  const dayEvents = byDate[iso] ?? [];
                  const isToday = iso === todayIso;
                  return (
                    <button
                      key={iso}
                      onClick={() => setSelected(iso === selected ? null : iso)}
                      className={`h-16 sm:h-24 p-1 sm:p-1.5 border-b border-r border-dashed text-center sm:text-left align-top transition-colors ${
                        iso === selected ? "bg-primary/10" : "hover:bg-secondary/50"
                      }`}
                    >
                      <span className={`inline-block text-sm sm:text-base ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>
                        {isToday ? <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">{day}</span> : day}
                      </span>
                      {/* telemóvel: pontos; computador: etiquetas */}
                      <div className="flex justify-center gap-0.5 mt-1 sm:hidden">
                        {dayEvents.slice(0, 3).map((ev) => <span key={ev.id} className={`h-1.5 w-1.5 rounded-full ${KIND_META[ev.kind].dot}`} />)}
                      </div>
                      <div className="hidden sm:block space-y-0.5 mt-1">
                        {dayEvents.slice(0, 2).map((ev) => (
                          <div key={ev.id} className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs truncate border ${KIND_META[ev.kind].bg} ${KIND_META[ev.kind].color}`}>
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${KIND_META[ev.kind].dot}`} />
                            <span className="truncate">{ev.title}</span>
                          </div>
                        ))}
                        {dayEvents.length > 2 && <div className="text-xs text-muted-foreground pl-1">+{dayEvents.length - 2} mais</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Legenda */}
          <div className="flex flex-wrap gap-4">
            {(Object.entries(KIND_META) as [EventKind, typeof KIND_META[EventKind]][]).map(([k, m]) => (
              <div key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${m.dot}`} />{m.label}
              </div>
            ))}
          </div>

          {/* Eventos do dia selecionado */}
          {selected && (
            <section className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{formatLong(selected)}</h3>
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground" aria-label="Fechar">
                  <X size={16} />
                </button>
              </div>
              {selectedEvents.length === 0
                ? <p className="text-sm text-muted-foreground">Sem eventos neste dia.</p>
                : selectedEvents.map((ev) => <EventCard key={ev.id} ev={ev} />)}
            </section>
          )}
        </>
      ) : (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Próximos eventos</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">A carregar eventos…</p>
          ) : upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Não há eventos futuros.</p>
          ) : (
            Object.entries(
              upcoming.reduce<Record<string, CalendarEvent[]>>((acc, ev) => { (acc[ev.date] ??= []).push(ev); return acc; }, {}),
            ).map(([date, list]) => (
              <div key={date} className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground">{formatLong(date)}</h3>
                {list.map((ev) => <EventCard key={ev.id} ev={ev} />)}
              </div>
            ))
          )}
        </section>
      )}

      {/* Exportar */}
      <div className="flex justify-center pt-2">
        <Button
          onClick={() => exportIcs(filtered)}
          disabled={filtered.length === 0}
          className="uppercase tracking-wide"
        >
          <Download className="h-4 w-4 mr-2" /> Exportar calendário
        </Button>
      </div>

      {/* Vista de vários meses (anterior, atual e seguinte) */}
      <div className="bg-card border p-4 space-y-6">
        {[prev, { year: viewYear, month: viewMonth }, next].map((m) => (
          <MiniMonth
            key={`${m.year}-${m.month}`}
            year={m.year} month={m.month}
            byDate={byDate} todayIso={todayIso} selected={selected} onPick={pickMini}
          />
        ))}
      </div>

      {/* Modal: Novo evento */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowNew(false)} />
          <form onSubmit={saveEvent} className="relative w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl border shadow-xl p-5 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Novo evento</h2>
              <button type="button" onClick={() => setShowNew(false)} className="p-1.5 rounded-md hover:bg-secondary" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="ev-title">Título</label>
              <Input id="ev-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="ev-date">Data</label>
                <Input id="ev-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="ev-time">Hora</label>
                <Input id="ev-time" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="ev-course">Disciplina</label>
              <select
                id="ev-course"
                value={form.course_id}
                onChange={(e) => setForm({ ...form, course_id: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Pessoal (sem disciplina)</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="ev-desc">Descrição</label>
              <textarea
                id="ev-desc" rows={3} value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">Hora de Maputo. Só tu vês os eventos pessoais.</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "A guardar…" : "Guardar"}</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
