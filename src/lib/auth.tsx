import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type Role = "admin" | "instructor" | "student";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  roles: Role[];
  profile: { full_name: string; avatar_url: string | null; email: string | null } | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [profile, setProfile] = useState<AuthCtx["profile"]>(null);
  const [loading, setLoading] = useState(true);
  // Utilizador cujos papéis já foram carregados (evita mostrar "carregando" em cada refresh do token)
  const loadedFor = useRef<string | null>(null);

  const loadExtras = async (uid: string) => {
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("profiles").select("full_name, avatar_url, email").eq("id", uid).maybeSingle(),
    ]);
    setRoles(((r ?? []) as { role: Role }[]).map((x) => x.role));
    setProfile(p ?? null);
    loadedFor.current = uid;
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        const uid = s.user.id;
        // Ao iniciar sessão os papéis ainda não foram carregados: manter "loading" até chegarem,
        // senão o redirecionamento usa papéis vazios e envia o admin para a área de estudante.
        if (loadedFor.current !== uid) setLoading(true);
        setTimeout(() => { loadExtras(uid).finally(() => setLoading(false)); }, 0);
      } else {
        loadedFor.current = null;
        setRoles([]);
        setProfile(null);
        setLoading(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) loadExtras(data.session.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <Ctx.Provider
      value={{
        user, session, roles, profile, loading,
        signOut: async () => { await supabase.auth.signOut(); },
        refreshRoles: async () => { if (user) await loadExtras(user.id); },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}

export function primaryRole(roles: Role[]): Role {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("instructor")) return "instructor";
  return "student";
}
