import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  ClipboardList,
  FileText,
  ExternalLink,
  X,
  Calendar,
  Clock,
  MapPin,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type EventKind = "aula" | "teste" | "trabalho";

interface CalendarEvent {
  id: string;
  kind: EventKind;
  title: string;
  subject: string;
  date: string;        // ISO yyyy-mm-dd
  time?: string;       // HH:MM
  duration?: number;   // minutes
  zoom_url?: string;
  location?: string;
  description?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Fuso horário da instituição (Moçambique, UTC+2, sem horário de verão).
// Usado para saber "hoje", independentemente do fuso do dispositivo.
const APP_TZ = "Africa/Maputo";

function todayInAppTZ() {
  // "en-CA" formata como yyyy-mm-dd
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y, month: m - 1, day: d };
}

// O Postgres devolve colunas "time" como HH:MM:SS; mostramos só HH:MM.
function formatTime(t?: string | null) {
  return t ? t.slice(0, 5) : "";
}

// Dia da semana (Seg=0 … Dom=6) de uma data yyyy-mm-dd, sem depender do fuso.
function weekdayIndex(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

const KIND_META: Record<EventKind, { label: string; color: string; bg: string; dot: string; Icon: typeof BookOpen }> = {
  aula:     { label: "Aula",     color: "text-blue-600",   bg: "bg-blue-50 border-blue-200",   dot: "bg-blue-500",   Icon: BookOpen },
  teste:    { label: "Teste",    color: "text-violet-600", bg: "bg-violet-50 border-violet-200", dot: "bg-violet-500", Icon: ClipboardList },
  trabalho: { label: "Trabalho", color: "text-amber-600",  bg: "bg-amber-50 border-amber-200", dot: "bg-amber-500",  Icon: FileText },
};

function isoDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

function firstDayOfWeek(y: number, m: number) {
  // 0=Sun … 6=Sat → shift so Mon=0
  return (new Date(y, m, 1).getDay() + 6) % 7;
}

const MONTH_PT = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
const DAY_PT = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];

// ─── Component ───────────────────────────────────────────────────────────────

export default function StudentCalendar() {
  const { user } = useAuth();

  const today = useMemo(() => todayInAppTZ(), []);
  const [viewYear, setViewYear]   = useState(today.year);
  const [viewMonth, setViewMonth] = useState(today.month);
  const [events, setEvents]       = useState<CalendarEvent[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<string | null>(null); // iso date

  // ── Fetch all events for enrolled subjects ──────────────────────────────

  useEffect(() => {
    if (!user) return;
    const userId = user.id;

    async function load() {
      setLoading(true);
      try {
        // 1. Get subjects the student is enrolled in
        const { data: enrollments, error: eErr } = await supabase
          .from("enrollments")
          .select("subject_id")
          .eq("student_id", userId);

        if (eErr) throw eErr;
        const subjectIds = (enrollments ?? []).map((e: { subject_id: string }) => e.subject_id);
        if (subjectIds.length === 0) { setEvents([]); return; }

        // 2. Parallel fetch: aulas, testes, trabalhos
        const [aulasRes, testesRes, trabalhosRes] = await Promise.all([
          supabase
            .from("aulas")
            .select("id, title, subject_id, date, time, duration, zoom_url, location, description, subjects(name)")
            .in("subject_id", subjectIds),
          supabase
            .from("testes")
            .select("id, title, subject_id, date, time, location, description, subjects(name)")
            .in("subject_id", subjectIds),
          supabase
            .from("trabalhos")
            .select("id, title, subject_id, date, description, subjects(name)")
            .in("subject_id", subjectIds),
        ]);

        if (aulasRes.error) throw aulasRes.error;
        if (testesRes.error) throw testesRes.error;
        if (trabalhosRes.error) throw trabalhosRes.error;

        const toEvent = (kind: EventKind) => (row: Record<string, unknown>): CalendarEvent => ({
          id:          `${kind}-${row.id}`,
          kind,
          title:       row.title as string,
          subject:     (row.subjects as { name: string } | null)?.name ?? "—",
          date:        row.date as string,
          time:        formatTime(row.time as string | undefined) || undefined,
          duration:    row.duration as number | undefined,
          zoom_url:    row.zoom_url as string | undefined,
          location:    row.location as string | undefined,
          description: row.description as string | undefined,
        });

        const all: CalendarEvent[] = [
          ...(aulasRes.data     ?? []).map(toEvent("aula")),
          ...(testesRes.data    ?? []).map(toEvent("teste")),
          ...(trabalhosRes.data ?? []).map(toEvent("trabalho")),
        ];

        setEvents(all);
      } catch (err) {
        console.error("Erro ao carregar calendário:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user]);

  // ── Index events by date ────────────────────────────────────────────────

  const byDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }, [events]);

  // ── Navigation ─────────────────────────────────────────────────────────

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
    setSelected(null);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
    setSelected(null);
  }

  // ── Calendar grid ──────────────────────────────────────────────────────

  const totalDays  = daysInMonth(viewYear, viewMonth);
  const startOffset = firstDayOfWeek(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  // Cópia antes de ordenar para não alterar o estado original
  const selectedEvents = selected
    ? [...(byDate[selected] ?? [])].sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""))
    : [];
  const todayIso = isoDate(today.year, today.month, today.day);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <Calendar size={24} className="text-blue-500" />
          Calendário
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Aulas, testes e trabalhos das tuas disciplinas
        </p>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        {/* ── Calendar panel ────────────────────────────────────────────── */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* Month navigation */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <button
              onClick={prevMonth}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Mês anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <h2 className="text-base font-semibold text-gray-800">
              {MONTH_PT[viewMonth]} {viewYear}
            </h2>
            <button
              onClick={nextMonth}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Próximo mês"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {DAY_PT.map(d => (
              <div key={d} className="py-2 text-center text-xs font-medium text-gray-400 uppercase tracking-wide">
                {d}
              </div>
            ))}
          </div>

          {/* Grid */}
          {loading ? (
            <div className="flex items-center justify-center h-64 text-sm text-gray-400">
              A carregar eventos…
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {cells.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} className="h-24 border-b border-r border-gray-50" />;
                }
                const iso = isoDate(viewYear, viewMonth, day);
                const dayEvents = byDate[iso] ?? [];
                const isToday = iso === todayIso;
                const isSelected = iso === selected;

                return (
                  <button
                    key={iso}
                    onClick={() => setSelected(iso === selected ? null : iso)}
                    className={`h-24 p-1.5 border-b border-r border-gray-50 text-left transition-colors
                      ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}
                    `}
                  >
                    <span className={`
                      inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium mb-1
                      ${isToday ? "bg-blue-500 text-white" : "text-gray-700"}
                    `}>
                      {day}
                    </span>

                    <div className="space-y-0.5 overflow-hidden">
                      {dayEvents.slice(0, 3).map(ev => {
                        const meta = KIND_META[ev.kind];
                        return (
                          <div
                            key={ev.id}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs truncate border ${meta.bg} ${meta.color}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
                            <span className="truncate">{ev.title}</span>
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div className="text-xs text-gray-400 pl-1">
                          +{dayEvents.length - 3} mais
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-5 px-6 py-3 border-t border-gray-100">
            {(Object.entries(KIND_META) as [EventKind, typeof KIND_META[EventKind]][]).map(([kind, meta]) => (
              <div key={kind} className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                {meta.label}
              </div>
            ))}
          </div>
        </div>

        {/* ── Side panel ────────────────────────────────────────────────── */}
        <div className={`xl:w-80 transition-all duration-200 ${selected ? "block" : "hidden xl:block"}`}>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 h-full">
            {selected ? (
              <>
                {/* Panel header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                      {DAY_PT[weekdayIndex(selected)]}
                    </p>
                    <p className="text-base font-semibold text-gray-800">
                      {Number(selected.split("-")[2])} de {MONTH_PT[Number(selected.split("-")[1]) - 1]}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400"
                    aria-label="Fechar painel"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Events list */}
                <div className="p-4 space-y-3 overflow-y-auto max-h-[60vh] xl:max-h-[calc(100vh-280px)]">
                  {selectedEvents.length === 0 ? (
                    <div className="text-center py-12 text-sm text-gray-400">
                      Sem eventos neste dia.
                    </div>
                  ) : (
                    selectedEvents.map(ev => {
                        const meta = KIND_META[ev.kind];
                        const Icon = meta.Icon;
                        return (
                          <div
                            key={ev.id}
                            className={`rounded-xl border p-4 ${meta.bg}`}
                          >
                            {/* Kind badge + title */}
                            <div className="flex items-start gap-3">
                              <div className={`mt-0.5 p-1.5 rounded-lg bg-white shadow-sm ${meta.color}`}>
                                <Icon size={14} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className={`text-xs font-medium uppercase tracking-wide ${meta.color}`}>
                                  {meta.label}
                                </span>
                                <p className="font-semibold text-gray-900 text-sm leading-snug mt-0.5">
                                  {ev.title}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">{ev.subject}</p>
                              </div>
                            </div>

                            {/* Meta rows */}
                            <div className="mt-3 space-y-1.5 pl-9">
                              {ev.time && (
                                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                  <Clock size={12} className="flex-shrink-0" />
                                  <span>
                                    {ev.time}
                                    {ev.duration ? ` · ${ev.duration} min` : ""}
                                  </span>
                                </div>
                              )}
                              {ev.location && (
                                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                  <MapPin size={12} className="flex-shrink-0" />
                                  <span>{ev.location}</span>
                                </div>
                              )}
                              {ev.description && (
                                <p className="text-xs text-gray-500 leading-relaxed pt-0.5">
                                  {ev.description}
                                </p>
                              )}
                            </div>

                            {/* Zoom button */}
                            {ev.zoom_url && (
                              <a
                                href={ev.zoom_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-3 ml-9 inline-flex items-center gap-1.5 text-xs font-medium
                                  bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                              >
                                <ExternalLink size={12} />
                                Entrar na aula
                              </a>
                            )}
                          </div>
                        );
                      })
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-20 text-center px-8">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <Calendar size={20} className="text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-600">Selecciona um dia</p>
                <p className="text-xs text-gray-400 mt-1">
                  Clica num dia do calendário para ver os eventos.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
