import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Video, ClipboardList, FileCheck2, Calendar } from "lucide-react";

export const Route = createFileRoute("/student/calendar")({
  component: () => <RequireAuth allow={["student", "instructor", "admin"]}><Page /></RequireAuth>,
});

type CalItem = {
  id: string;
  title: string;
  date: Date;
  type: "lesson" | "quiz" | "assignment";
  url?: string;
  courseCode?: string;
};

const TYPE_STYLE = {
  lesson:     { bg: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",     dot: "bg-blue-500",    icon: Video,          label: "Aula" },
  quiz:       { bg: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300", dot: "bg-violet-500", icon: ClipboardList,  label: "Teste" },
  assignment: { bg: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",  dot: "bg-amber-500",   icon: FileCheck2,     label: "Trabalho" },
};

function fmt(d: Date) {
  return d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

function Page() {
  const { user } = useAuth();
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [items, setItems] = useState<CalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);

  const month = cursor.getMonth();
  const year  = cursor.getFullYear();

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    (async () => {
      // 1. Disciplinas do aluno
      const { data: enr } = await supabase
        .from("enrollments")
        .select("course:courses(id, code)")
        .eq("student_id", user.id);
      const courses: { id: string; code: string }[] = (enr ?? []).map((e: any) => e.course).filter(Boolean);
      const courseIds = courses.map((c) => c.id);
      if (courseIds.length === 0) { setItems([]); setLoading(false); return; }

      const courseMap = Object.fromEntries(courses.map((c) => [c.id, c.code]));

      // Range do mês
      const start = new Date(year, month, 1).toISOString();
      const end   = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

      const all: CalItem[] = [];

      // 2. Aulas (zoom_lessons via course_topics)
      const { data: lessons } = await supabase
        .from("zoom_lessons")
        .select("id, title, starts_at, zoom_url, topic:course_topics(course_id)")
        .gte("starts_at", start)
        .lte("starts_at", end);
      for (const l of lessons ?? []) {
        const cid = (l as any).topic?.course_id;
        if (!cid || !courseIds.includes(cid)) continue;
        all.push({ id: l.id, title: l.title, date: new Date(l.starts_at), type: "lesson", url: l.zoom_url, courseCode: courseMap[cid] });
      }

      // 3. Testes
      const { data: quizzes } = await supabase
        .from("quizzes")
        .select("id, title, opens_at, course_id")
        .in("course_id", courseIds)
        .gte("opens_at", start)
        .lte("opens_at", end);
      for (const q of quizzes ?? []) {
        if (!q.opens_at) continue;
        all.push({ id: q.id, title: q.title, date: new Date(q.opens_at), type: "quiz", courseCode: courseMap[q.course_id] });
      }

      // 4. Trabalhos
      const { data: assigns } = await supabase
        .from("assignments")
        .select("id, title, due_at, course_id")
        .in("course_id", courseIds)
        .gte("due_at", start)
        .lte("due_at", end);
      for (const a of assigns ?? []) {
        if (!a.due_at) continue;
        all.push({ id: a.id, title: a.title, date: new Date(a.due_at), type: "assignment", courseCode: courseMap[a.course_id] });
      }

      all.sort((a, b) => a.date.getTime() - b.date.getTime());
      setItems(all);
      setLoading(false);
    })();
  }, [user, month, year]);

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = useMemo(() => {
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length % 7) arr.push(null);
    return arr;
  }, [firstDay, daysInMonth]);

  const byDay = useMemo(() => {
    const m = new Map<number, CalItem[]>();
    for (const item of items) {
      const d = item.date.getDate();
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(item);
    }
    return m;
  }, [items]);

  const today     = new Date();
  const isToday   = (d: number) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  const monthName = cursor.toLocaleString("pt-PT", { month: "long", year: "numeric" });

  const selectedItems = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calendar className="h-6 w-6 text-primary" /> Calendário
        </h1>
        <div className="flex items-center gap-1">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="p-2 rounded-md border hover:bg-secondary transition">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="capitalize text-sm font-semibold w-44 text-center">{monthName}</span>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="p-2 rounded-md border hover:bg-secondary transition">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 flex-wrap">
        {(Object.entries(TYPE_STYLE) as [keyof typeof TYPE_STYLE, typeof TYPE_STYLE[keyof typeof TYPE_STYLE]][]).map(([key, s]) => (
          <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
            {s.label}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_280px] gap-4">
        {/* Grelha do calendário */}
        <div>
          {/* Dias da semana */}
          <div className="grid grid-cols-7 mb-1">
            {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map((d) => (
              <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {/* Células */}
          <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden border">
            {cells.map((d, i) => {
              const dayItems = d ? (byDay.get(d) ?? []) : [];
              const active   = d === selected;
              return (
                <button
                  key={i}
                  onClick={() => d && setSelected(d === selected ? null : d)}
                  disabled={!d}
                  className={`bg-card min-h-16 sm:min-h-20 p-1.5 text-left transition
                    ${d ? "hover:bg-secondary/50 cursor-pointer" : "opacity-0 pointer-events-none"}
                    ${active ? "ring-2 ring-inset ring-primary" : ""}
                  `}
                >
                  {d && (
                    <>
                      <span className={`text-xs font-semibold inline-flex h-5 w-5 items-center justify-center rounded-full
                        ${isToday(d) ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                        {d}
                      </span>
                      <div className="mt-1 space-y-0.5">
                        {dayItems.slice(0, 2).map((item) => {
                          const s = TYPE_STYLE[item.type];
                          return (
                            <div key={item.id} className={`text-[10px] rounded px-1 py-0.5 truncate leading-tight ${s.bg}`}>
                              {item.title}
                            </div>
                          );
                        })}
                        {dayItems.length > 2 && (
                          <div className="text-[10px] text-muted-foreground px-1">+{dayItems.length - 2}</div>
                        )}
                      </div>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Painel lateral — dia seleccionado ou lista do mês */}
        <div className="rounded-xl border bg-card overflow-hidden">
          {selected ? (
            <>
              <div className="px-4 py-3 border-b bg-secondary/30">
                <p className="text-sm font-semibold">
                  {selected} de {cursor.toLocaleString("pt-PT", { month: "long" })}
                </p>
                <p className="text-xs text-muted-foreground">{selectedItems.length} evento(s)</p>
              </div>
              {selectedItems.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground text-center">Sem eventos.</p>
              ) : (
                <ul className="divide-y">
                  {selectedItems.map((item) => <EventRow key={item.id} item={item} />)}
                </ul>
              )}
            </>
          ) : (
            <>
              <div className="px-4 py-3 border-b bg-secondary/30">
                <p className="text-sm font-semibold capitalize">{monthName}</p>
                <p className="text-xs text-muted-foreground">{items.length} evento(s) este mês</p>
              </div>
              {loading ? (
                <p className="px-4 py-6 text-sm text-muted-foreground text-center">A carregar…</p>
              ) : items.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground text-center">Sem eventos este mês.</p>
              ) : (
                <ul className="divide-y max-h-[420px] overflow-y-auto">
                  {items.map((item) => <EventRow key={item.id} item={item} />)}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EventRow({ item }: { item: CalItem }) {
  const s = TYPE_STYLE[item.type];
  const Icon = s.icon;
  return (
    <li className="px-4 py-3 flex items-start gap-3">
      <div className={`mt-0.5 h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${s.bg}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.title}</p>
        <p className="text-xs text-muted-foreground">
          {item.date.toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}
          {" · "}
          {fmt(item.date)}
          {item.courseCode ? ` · ${item.courseCode}` : ""}
        </p>
      </div>
      {item.type === "lesson" && item.url && (
        <a href={item.url} target="_blank" rel="noreferrer"
          className="text-xs rounded bg-primary text-primary-foreground px-2 py-1 shrink-0">
          Entrar
        </a>
      )}
    </li>
  );
}
