import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    if (ue || !u.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const admin = createClient(url, service);
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

    const body = await req.json();
    const { email, password, full_name, role } = body as { email: string; password: string; full_name: string; role: "admin" | "instructor" | "student" };
    if (!email || !password || !role) return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const { data: created, error: ce } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: full_name ?? "" },
    });
    if (ce || !created.user) return new Response(JSON.stringify({ error: ce?.message ?? "Create failed" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const uid = created.user.id;
    await admin.from("profiles").upsert({ id: uid, full_name: full_name ?? "", email });
    if (role !== "student") {
      await admin.from("user_roles").delete().eq("user_id", uid).eq("role", "student");
      await admin.from("user_roles").insert({ user_id: uid, role });
    }

    return new Response(JSON.stringify({ ok: true, user_id: uid }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
