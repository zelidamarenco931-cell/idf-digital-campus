import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/student/calendar")({
  component: () => <RequireAuth><Page /></RequireAuth>,
});

function Page() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const start = new Date(cursor); start.setDate(1);
    const end = new Date(cursor); end.setMonth(end.getMonth() + 1); end.setDate(0);
    (async () => {
      const { data } = await supabase.from("calendar_events").select("*")
        .gte("starts_at", start.toISOString()).lte("starts_at", end.toISOString());
      setEvents(data ?? []);
    })();
  }, [cursor]);

  const month = cursor.getMonth(); const year = cursor.getFullYear();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = useMemo(() => {
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length % 7) arr.push(null);
    return arr;
  }, [firstDay, daysInMonth]);

  const eventsByDay = useMemo(() => {
    const m = new Map<number, any[]>();
    for (const e of events) {
      const d = new Date(e.starts_at).getDate();
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(e);
    }
    return m;
  }, [events]);

  const monthName = cursor.toLocaleString("pt-PT", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Calendário</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-2 rounded border"><ChevronLeft className="h-4 w-4" /></button>
          <span className="capitalize text-sm font-medium w-40 text-center">{monthName}</span>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-2 rounded border"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-xs text-muted-foreground">
        {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(d => <div key={d} className="px-2 py-1 font-medium">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border">
        {cells.map((d, i) => (
          <div key={i} className="bg-card min-h-24 p-2 text-xs">
            {d && (
              <>
                <div className="font-medium text-foreground">{d}</div>
                <div className="space-y-1 mt-1">
                  {(eventsByDay.get(d) ?? []).slice(0, 3).map((e) => (
                    <div key={e.id} className="rounded bg-primary/10 text-primary px-1.5 py-0.5 truncate" title={e.title}>
                      {e.title}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
