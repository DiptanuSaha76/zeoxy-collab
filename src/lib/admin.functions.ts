import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(supabase: { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> }, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden");
}

export const listAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase as any, userId);
    const [{ data: roles, error: rolesErr }, { supabaseAdmin }] = await Promise.all([
      supabase.from("user_roles").select("user_id").eq("role", "admin"),
      import("@/integrations/supabase/client.server"),
    ]);
    if (rolesErr) throw rolesErr;
    const { data: users, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersErr) throw usersErr;
    const ids = new Set((roles ?? []).map((r) => r.user_id));
    return (users.users ?? [])
      .filter((u) => ids.has(u.id))
      .map((u) => ({ id: u.id, email: u.email ?? "", created_at: u.created_at }));
  });

export const listAdminInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase as any, userId);
    const { data, error } = await supabase.from("admin_invites").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((i) => ({ ...i, email: i.email.toLowerCase() }));
  });

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase as any, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles, error: profErr }, { data: orders, error: ordErr }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, username, phone, created_at"),
      supabaseAdmin.from("orders").select("user_id, amount, status"),
    ]);
    if (profErr) throw profErr;
    if (ordErr) throw ordErr;
    return (profiles ?? []).map((p) => {
      const mine = (orders ?? []).filter((o) => o.user_id === p.id);
      return {
        id: p.id,
        username: p.username ?? "",
        display_name: p.display_name ?? "",
        phone: p.phone ?? "",
        created_at: p.created_at,
        orders: mine.length,
        spent: mine
          .filter((o) => o.status === "completed")
          .reduce((sum, o) => sum + Number(o.amount), 0),
      };
    });
  });

const addAdminSchema = z.object({ email: z.string().email() });

export const addAdminByEmail = createServerFn({ method: "POST" })
  .inputValidator((data) => addAdminSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase as any, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listErr) throw listErr;
    const existing = list.users?.find((u) => (u.email ?? "").toLowerCase() === email);
    if (existing) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: existing.id, role: "admin" }, { onConflict: "user_id,role" });
      if (error) throw error;
      return { created: true, invite: false };
    }
    const { error } = await supabase.from("admin_invites").insert({ email, created_by: userId });
    if (error) throw error;
    return { created: true, invite: true };
  });

const removeAdminSchema = z.object({ userId: z.string().optional(), email: z.string().email().optional() });

export const removeAdmin = createServerFn({ method: "POST" })
  .inputValidator((data) => removeAdminSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase as any, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.userId) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "admin");
      if (error) throw error;
    }
    if (data.email) {
      const { error } = await supabase.from("admin_invites").delete().ilike("email", data.email);
      if (error) throw error;
    }
    return { ok: true };
  });
const reorderGamesSchema = z.object({
  order: z
    .array(
      z.object({
        id: z.string(),
        sort_order: z.number().int(),
      }),
    )
    .min(1),
});

export const reorderGames = createServerFn({ method: "POST" })
  .inputValidator((data) => reorderGamesSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    await requireAdmin(supabase as any, userId);

    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");

    const results = await Promise.all(
      data.order.map((row) =>
        supabaseAdmin
          .from("games")
          .update({
            sort_order: row.sort_order,
          })
          .eq("id", row.id),
      ),
    );

    const firstError = results.find((r) => r.error)?.error;

    if (firstError) throw firstError;

    return { ok: true };
  });