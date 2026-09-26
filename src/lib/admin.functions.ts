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
    const { data: profiles, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .in("id", [...ids]);
    if (profErr) throw profErr;
    const usernames = new Map((profiles ?? []).map((p) => [p.id, p.username ?? ""]));
    return (users.users ?? [])
      .filter((u) => ids.has(u.id))
      .map((u) => ({
        id: u.id,
        email: u.email ?? "",
        username: usernames.get(u.id) ?? "",
        created_at: u.created_at,
      }));
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

const addAdminSchema = z.object({ identifier: z.string().trim().min(1).max(320) });

export const addAdmin = createServerFn({ method: "POST" })
  .inputValidator((data) => addAdminSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase as any, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const value = data.identifier.toLowerCase();

    let targetId: string | null = null;
    if (value.includes("@")) {
      const { data: id, error } = await supabaseAdmin.rpc("auth_user_id_by_email", {
        _email: value,
      });
      if (error) throw error;
      targetId = typeof id === "string" ? id : null;
    } else {
      const { data: profile, error } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("username", value)
        .maybeSingle();
      if (error) throw error;
      targetId = profile?.id ?? null;
    }
    if (!targetId) {
      return {
        ok: false as const,
        message: "No account with that username or email. They need to register first.",
      };
    }

    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: targetId, role: "admin" }, { onConflict: "user_id,role" });
    if (error) throw error;
    return { ok: true as const };
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

/* ---------------- Contact messages ---------------- */

/*
 * This helper intentionally does not use the overloaded public.has_role(...)
 * RPC. Your database currently has both:
 *   has_role(uuid, text)
 *   has_role(uuid, app_role)
 * so calling that RPC can produce PGRST203.
 *
 * Instead we check the current user's admin role directly with the server-only
 * Supabase client.
 */
async function requireContactAdmin(userId: string) {
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");

  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (error || !data) {
    throw new Error("Forbidden");
  }

  return supabaseAdmin;
}

export const listContactMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await requireContactAdmin(context.userId);

    const { data, error } = await (supabaseAdmin as any)
      .from("contact_messages")
      .select(
        "id, name, email, order_number, message, status, created_at, read_at, resolved_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    return data ?? [];
  });

const updateContactMessageStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "read", "resolved"]),
});

export const updateContactMessageStatus = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    updateContactMessageStatusSchema.parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const supabaseAdmin = await requireContactAdmin(context.userId);
    const now = new Date().toISOString();

    const patch: {
      status: "new" | "read" | "resolved";
      read_at?: string | null;
      resolved_at?: string | null;
    } = {
      status: data.status,
    };

    if (data.status === "new") {
      patch.read_at = null;
      patch.resolved_at = null;
    } else if (data.status === "read") {
      patch.read_at = now;
      patch.resolved_at = null;
    } else {
      patch.read_at = now;
      patch.resolved_at = now;
    }

    const { error } = await (supabaseAdmin as any)
      .from("contact_messages")
      .update(patch)
      .eq("id", data.id);

    if (error) throw error;

    return { ok: true };
  });