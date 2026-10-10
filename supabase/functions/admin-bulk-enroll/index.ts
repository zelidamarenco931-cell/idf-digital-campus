import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ROWS = 100;

// Sem caracteres que se confundem (0/O, 1/l/I)
function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const a = new Uint32Array(10);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => chars[n % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: u, error: ue } = await userClient.auth.getUser(token);
    if (ue || !u.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, service);
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const body = await req.json();
    const courseId: string | null = body?.course_id ?? null;
    const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) return json({ error: "Sem linhas para processar" }, 400);
    if (rows.length > MAX_ROWS) return json({ error: `Máximo de ${MAX_ROWS} alunos por pedido` }, 400);

    if (courseId) {
      const { data: course } = await admin.from("courses").select("id").eq("id", courseId).maybeSingle();
      if (!course) return json({ error: "Disciplina não encontrada" }, 404);
    }

    const results: any[] = [];
    for (const raw of rows) {
      const email = String(raw?.email ?? "").trim().toLowerCase();
      const full_name = String(raw?.full_name ?? "").trim();
      if (!EMAIL.test(email)) {
        results.push({ email: String(raw?.email ?? ""), full_name, status: "erro", message: "Email inválido" });
        continue;
      }
      try {
        let uid: string;
        let status: "criado" | "existente";
        let password: string | undefined;

        const { data: prof } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
        if (prof) {
          uid = prof.id;
          status = "existente";
        } else {
          const given = String(raw?.password ?? "").trim();
          password = given.length >= 6 ? given : genPassword();
          const { data: created, error: ce } = await admin.auth.admin.createUser({
            email, password, email_confirm: true, user_metadata: { full_name },
          });
          if (ce || !created.user) {
            const msg = ce?.message ?? "Falha ao criar a conta";
            results.push({
              email, full_name, status: "erro",
              message: /already|registered|exists/i.test(msg) ? "Email já existe (procura em Utilizadores)" : msg,
            });
            continue;
          }
          uid = created.user.id;
          status = "criado";
          await admin.from("profiles").upsert({ id: uid, full_name, email });
        }

        // Garante que a conta tem pelo menos um papel (por defeito, aluno)
        const { count } = await admin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("user_id", uid);
        if (!count) await admin.from("user_roles").insert({ user_id: uid, role: "student" });

        let enrolled: "inscrito" | "ja_inscrito" | null = null;
        if (courseId) {
          const { data: ex } = await admin.from("enrollments").select("student_id").eq("course_id", courseId).eq("student_id", uid).maybeSingle();
          if (ex) enrolled = "ja_inscrito";
          else {
            const { error: ee } = await admin.from("enrollments").insert({ course_id: courseId, student_id: uid });
            if (ee) throw ee;
            enrolled = "inscrito";
          }
        }

        results.push({ email, full_name, status, password, enrolled });
      } catch (e) {
        results.push({ email, full_name, status: "erro", message: String((e as Error).message ?? e) });
      }
    }

    return json({ ok: true, results });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
