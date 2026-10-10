import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

// Fuso horário da instituição (Moçambique, UTC+2).
const TZ = "Africa/Maputo";

export function greetingNow() {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date()),
  );
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export function todayLong() {
  const s = new Date().toLocaleDateString("pt-PT", {
    timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function Hero({
  eyebrow, title, subtitle, initial, avatarUrl, actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  initial: string;
  avatarUrl?: string | null;
  actions?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-primary/70 text-primary-foreground p-5 sm:p-7 shadow-sm">
      <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute right-20 -bottom-20 h-48 w-48 rounded-full bg-white/10" />
      <div className="relative flex items-start gap-4">
        <div className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-full bg-white/20 ring-2 ring-white/40 flex items-center justify-center text-xl font-bold overflow-hidden">
          {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initial}
        </div>
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <span className="inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide">
              {eyebrow}
            </span>
          )}
          <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold leading-tight break-words">{title}</h1>
          {subtitle && <p className="mt-1 text-sm opacity-85">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="relative mt-5 flex flex-wrap gap-2">{actions}</div>}
    </section>
  );
}

export function HeroLink({
  to, icon, children, solid,
}: { to: string; icon?: ReactNode; children: ReactNode; solid?: boolean }) {
  return (
    <Link
      to={to as any}
      className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
        solid
          ? "bg-white text-primary hover:bg-white/90"
          : "bg-white/15 text-primary-foreground ring-1 ring-white/30 hover:bg-white/25"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}

export type Tone = "blue" | "violet" | "amber" | "emerald" | "rose" | "sky" | "slate";

const TONES: Record<Tone, string> = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300",
};

export function StatTile({
  icon, label, value, tone = "blue", highlight,
}: { icon: ReactNode; label: string; value: number | string; tone?: Tone; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl border bg-card p-4 flex items-center gap-3 shadow-sm ${
        highlight ? "border-amber-400 ring-1 ring-amber-300/50" : ""
      }`}
    >
      <div className={`h-11 w-11 rounded-lg flex items-center justify-center shrink-0 ${TONES[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-1 truncate">{label}</p>
      </div>
    </div>
  );
}
