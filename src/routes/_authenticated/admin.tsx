import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  ORDER_STATUSES,
  bannersQuery,
  gamesQuery,
  money,
  ordersQuery,
  packsQuery,
  settingsQuery,
  uploadGameImage,
  type Banner,
  type Game,
  type Pack,
} from "@/lib/store";
import {
  addAdminByEmail,
  listAdminInvites,
  listAdmins,
  listClients,
  removeAdmin,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin panel — Recharge" },
      { name: "description", content: "Manage games, packages, banners, orders and admins." },
      { property: "og:title", content: "Admin panel — Recharge" },
      { property: "og:description", content: "Manage games, packages, banners, orders and admins." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

const TABS = [
  "Games",
  "Packages",
  "Banners",
  "Orders",
  "Clients",
  "Discount",
  "Admins",
] as const;
type Tab = (typeof TABS)[number];

const field =
  "glass-panel w-full rounded-xl px-3 py-2.5 text-sm outline-none placeholder:text-faint focus:border-violet/50";
const btn = "glass-panel rounded-xl px-3 py-2 text-xs font-medium";
const primary =
  "brand-gradient rounded-xl px-4 py-2.5 font-display text-xs font-semibold text-ink disabled:opacity-50";

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[10px] uppercase tracking-wider text-faint">{children}</span>;
}

function AdminPage() {
  const { user, isAdmin, ready } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("Games");

  useEffect(() => {
    if (ready && user && !isAdmin) {
      toast.error("Admins only");
      navigate({ to: "/", replace: true });
    }
  }, [ready, user, isAdmin, navigate]);

  if (!isAdmin) {
    return <p className="px-5 py-10 text-sm text-faint">Checking admin access…</p>;
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <h1 className="font-display text-2xl font-semibold">Admin panel</h1>
      <p className="mt-1 text-xs text-faint">Manage the store end to end.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              t === tab
                ? "brand-gradient rounded-full px-4 py-2 font-display text-xs font-semibold text-ink"
                : "glass-panel rounded-full px-4 py-2 text-xs font-medium"
            }
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "Games" && <GamesTab />}
        {tab === "Packages" && <PackagesTab />}
        {tab === "Banners" && <BannersTab />}
        {tab === "Orders" && <OrdersTab />}
        {tab === "Clients" && <ClientsTab />}
        {tab === "Discount" && <DiscountTab />}
        {tab === "Admins" && <AdminsTab />}
      </div>
    </div>
  );
}

/* ---------------- Games ---------------- */

type GameForm = {
  name: string;
  slug: string;
  category: string;
  cover_url: string;
  currency_label: string;
  id_label: string;
  id_kind: string;
  id_min_len: string;
  id_max_len: string;
  id_help: string;
  requires_server_id: boolean;
  server_label: string;
  is_active: boolean;
  sort_order: string;
};

const emptyGame: GameForm = {
  name: "",
  slug: "",
  category: "Mobile",
  cover_url: "",
  currency_label: "Gems",
  id_label: "Player ID",
  id_kind: "text",
  id_min_len: "3",
  id_max_len: "40",
  id_help: "",
  requires_server_id: false,
  server_label: "Server / Zone ID",
  is_active: true,
  sort_order: "0",
};

function GamesTab() {
  const qc = useQueryClient();
  const { data: games = [] } = useQuery(gamesQuery({ includeInactive: true }));
  const [form, setForm] = useState<GameForm>({ ...emptyGame });
  const [editing, setEditing] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof GameForm>(k: K, v: GameForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function toggleActive(g: Game) {
    const { error } = await supabase
      .from("games")
      .update({ is_active: !g.is_active })
      .eq("id", g.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(g.is_active ? "Game hidden from the store" : "Game is now live");
    qc.invalidateQueries({ queryKey: ["games"] });
  }

  async function remove(g: Game) {
    if (!window.confirm(`Delete "${g.name}" and all of its recharge packs? This cannot be undone.`))
      return;
    const { error } = await supabase.from("games").delete().eq("id", g.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (editing === g.id) {
      setEditing(null);
      setForm({ ...emptyGame });
    }
    toast.success("Game deleted");
    qc.invalidateQueries({ queryKey: ["games"] });
    qc.invalidateQueries({ queryKey: ["packages"] });
    qc.invalidateQueries({ queryKey: ["banners"] });
  }

  async function save() {
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error("Name and slug are required");
      return;
    }
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      category: form.category,
      currency_label: form.currency_label,
      id_label: form.id_label,
      id_kind: form.id_kind,
      server_label: form.server_label,
      requires_server_id: form.requires_server_id,
      is_active: form.is_active,
      cover_url: form.cover_url || null,
      id_help: form.id_help || null,
      id_min_len: Number(form.id_min_len) || 1,
      id_max_len: Number(form.id_max_len) || 40,
      sort_order: Number(form.sort_order) || 0,
    };
    const { error } = editing
      ? await supabase.from("games").update(payload).eq("id", editing)
      : await supabase.from("games").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Game updated" : "Game added");
    setForm({ ...emptyGame });
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["games"] });
  }

  function edit(g: Game) {
    setEditing(g.id);
    setForm({
      name: g.name,
      slug: g.slug,
      category: g.category,
      cover_url: g.cover_url ?? "",
      currency_label: g.currency_label,
      id_label: g.id_label,
      id_kind: g.id_kind,
      id_min_len: String(g.id_min_len),
      id_max_len: String(g.id_max_len),
      id_help: g.id_help ?? "",
      requires_server_id: g.requires_server_id,
      server_label: g.server_label,
      is_active: g.is_active,
      sort_order: String(g.sort_order),
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr] lg:items-start">
      <div className="glass-panel rounded-2xl p-4">
        <p className="font-display text-sm font-semibold">{editing ? "Edit game" : "Add game"}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label><Label>Name</Label><input className={field} value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
          <label><Label>Slug</Label><input className={field} value={form.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"))} /></label>
          <label><Label>Category</Label><input className={field} value={form.category} onChange={(e) => set("category", e.target.value)} /></label>
          <label><Label>Currency label</Label><input className={field} value={form.currency_label} onChange={(e) => set("currency_label", e.target.value)} /></label>
          <div className="sm:col-span-2">
            <Label>Cover image</Label>
            <div className="flex items-center gap-3">
              {form.cover_url ? (
                <img
                  src={form.cover_url}
                  alt="Cover preview"
                  className="size-16 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <div className="size-16 shrink-0 rounded-xl bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setUploading(true);
                    try {
                      const url = await uploadGameImage(file);
                      set("cover_url", url);
                      toast.success("Image uploaded");
                    } catch {
                      toast.error("Could not upload that image");
                    }
                    setUploading(false);
                  }}
                  className="w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-xs"
                />
                <input
                  className={`${field} mt-2`}
                  value={form.cover_url}
                  onChange={(e) => set("cover_url", e.target.value)}
                  placeholder="…or paste an image link"
                />
              </div>
            </div>
            {uploading ? <p className="mt-1 text-[11px] text-faint">Uploading…</p> : null}
          </div>
          <label><Label>ID field label</Label><input className={field} value={form.id_label} onChange={(e) => set("id_label", e.target.value)} /></label>
          <label>
            <Label>ID type</Label>
            <select className={field} value={form.id_kind} onChange={(e) => set("id_kind", e.target.value)}>
              <option value="text">Text</option>
              <option value="numeric">Numbers only (UID)</option>
            </select>
          </label>
          <label><Label>Min length</Label><input type="number" className={field} value={form.id_min_len} onChange={(e) => set("id_min_len", e.target.value)} /></label>
          <label><Label>Max length</Label><input type="number" className={field} value={form.id_max_len} onChange={(e) => set("id_max_len", e.target.value)} /></label>
          <label className="sm:col-span-2"><Label>ID help text</Label><input className={field} value={form.id_help} onChange={(e) => set("id_help", e.target.value)} placeholder="Where to find your UID" /></label>
          <label><Label>Server label</Label><input className={field} value={form.server_label} onChange={(e) => set("server_label", e.target.value)} /></label>
          <label><Label>Sort order</Label><input type="number" className={field} value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} /></label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.requires_server_id} onChange={(e) => set("requires_server_id", e.target.checked)} /> Needs server / zone ID</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Active</label>
        </div>
        <div className="mt-4 flex gap-2">
          <button className={primary} onClick={save}>{editing ? "Save changes" : "Add game"}</button>
          {editing ? <button className={btn} onClick={() => { setEditing(null); setForm({ ...emptyGame }); }}>Cancel</button> : null}
        </div>
      </div>

      <div className="space-y-2">
        {games.map((g) => (
          <div key={g.id} className="glass-panel flex items-center justify-between gap-3 rounded-2xl p-3">
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold">{g.name}</p>
              <p className="truncate text-[11px] text-faint">
                /{g.slug} · {g.category} · {g.id_label}
                {g.requires_server_id ? " + server" : ""} {g.is_active ? "" : "· hidden"}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button className={btn} onClick={() => edit(g)}>Edit</button>
              <button className={btn} onClick={() => toggleActive(g)}>
                {g.is_active ? "Deactivate" : "Activate"}
              </button>
              <button
                className={`${btn} border-rose/40 text-rose`}
                onClick={() => remove(g)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


/* ---------------- Packages ---------------- */

function PackagesTab() {
  const qc = useQueryClient();
  const { data: games = [] } = useQuery(gamesQuery({ includeInactive: true }));
  const [gameId, setGameId] = useState("");
  useEffect(() => {
    if (!gameId && games.length) setGameId(games[0]!.id);
  }, [games, gameId]);
  const { data: packs = [] } = useQuery({
    ...packsQuery(gameId || undefined, { includeInactive: true }),
    enabled: Boolean(gameId),
  });

  type PackForm = {
    label: string;
    amount: string;
    price: string;
    bonus_text: string;
    is_popular: boolean;
    is_active: boolean;
    sort_order: string;
  };
  const empty: PackForm = { label: "", amount: "0", price: "0", bonus_text: "", is_popular: false, is_active: true, sort_order: "0" };
  const [form, setForm] = useState<PackForm>({ ...empty });
  const [editing, setEditing] = useState<string | null>(null);
  const set = <K extends keyof PackForm>(k: K, v: PackForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!gameId) {
      toast.error("Pick a game first");
      return;
    }
    if (!form.label.trim()) {
      toast.error("Label is required");
      return;
    }
    const payload = {
      game_id: gameId,
      label: form.label.trim(),
      amount: Number(form.amount) || 0,
      price: Number(form.price) || 0,
      bonus_text: form.bonus_text || null,
      is_popular: form.is_popular,
      is_active: form.is_active,
      sort_order: Number(form.sort_order) || 0,
    };
    const { error } = editing
      ? await supabase.from("packages").update(payload).eq("id", editing)
      : await supabase.from("packages").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Package updated" : "Package added");
    setForm({ ...empty });
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["packages"] });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("packages").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["packages"] });
  }

  function edit(p: Pack) {
    setEditing(p.id);
    setForm({
      label: p.label,
      amount: String(p.amount),
      price: String(p.price),
      bonus_text: p.bonus_text ?? "",
      is_popular: p.is_popular,
      is_active: p.is_active,
      sort_order: String(p.sort_order),
    });
  }


  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr] lg:items-start">
      <div className="glass-panel rounded-2xl p-4">
        <label><Label>Game</Label>
          <select className={field} value={gameId} onChange={(e) => { setGameId(e.target.value); setEditing(null); setForm({ ...empty }); }}>
            {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label><Label>Label</Label><input className={field} value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="500 Gems" /></label>
          <label><Label>Amount</Label><input type="number" className={field} value={form.amount} onChange={(e) => set("amount", e.target.value)} /></label>
          <label><Label>Price (₹)</Label><input type="number" className={field} value={form.price} onChange={(e) => set("price", e.target.value)} /></label>
          <label><Label>Sort order</Label><input type="number" className={field} value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} /></label>
          <label className="sm:col-span-2"><Label>Bonus text</Label><input className={field} value={form.bonus_text} onChange={(e) => set("bonus_text", e.target.value)} placeholder="+50 bonus" /></label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.is_popular} onChange={(e) => set("is_popular", e.target.checked)} /> Popular</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Active</label>
        </div>
        <div className="mt-4 flex gap-2">
          <button className={primary} onClick={save}>{editing ? "Save changes" : "Add package"}</button>
          {editing ? <button className={btn} onClick={() => { setEditing(null); setForm({ ...empty }); }}>Cancel</button> : null}
        </div>
      </div>

      <div className="space-y-2">
        {packs.map((p) => (
          <div key={p.id} className="glass-panel flex items-center justify-between gap-3 rounded-2xl p-3">
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold">{p.label}</p>
              <p className="text-[11px] text-faint">{money(p.price)} {p.is_popular ? "· popular" : ""} {p.is_active ? "" : "· hidden"}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button className={btn} onClick={() => edit(p)}>Edit</button>
              <button className={btn} onClick={() => remove(p.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Banners ---------------- */

function BannersTab() {
  const qc = useQueryClient();
  const { data: banners = [] } = useQuery(bannersQuery({ includeInactive: true }));
  const { data: games = [] } = useQuery(gamesQuery({ includeInactive: true }));
  type BannerForm = {
    title: string;
    subtitle: string;
    badge: string;
    image_url: string;
    game_id: string;
    is_active: boolean;
    sort_order: string;
  };
  const empty: BannerForm = { title: "", subtitle: "", badge: "Featured", image_url: "", game_id: "", is_active: true, sort_order: "0" };
  const [form, setForm] = useState<BannerForm>({ ...empty });
  const [editing, setEditing] = useState<string | null>(null);
  const set = <K extends keyof BannerForm>(k: K, v: BannerForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    const payload = {
      title: form.title.trim(),
      subtitle: form.subtitle || null,
      badge: form.badge || null,
      image_url: form.image_url || null,
      game_id: form.game_id || null,
      is_active: form.is_active,
      sort_order: Number(form.sort_order) || 0,
    };
    const { error } = editing
      ? await supabase.from("banners").update(payload).eq("id", editing)
      : await supabase.from("banners").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Banner updated" : "Banner added");
    setForm({ ...empty });
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["banners"] });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("banners").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["banners"] });
  }

  function edit(b: Banner) {
    setEditing(b.id);
    setForm({
      title: b.title,
      subtitle: b.subtitle ?? "",
      badge: b.badge ?? "",
      image_url: b.image_url ?? "",
      game_id: b.game_id ?? "",
      is_active: b.is_active,
      sort_order: String(b.sort_order),
    });
  }


  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr] lg:items-start">
      <div className="glass-panel rounded-2xl p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2"><Label>Title</Label><input className={field} value={form.title} onChange={(e) => set("title", e.target.value)} /></label>
          <label className="sm:col-span-2"><Label>Subtitle</Label><input className={field} value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)} /></label>
          <label><Label>Badge</Label><input className={field} value={form.badge} onChange={(e) => set("badge", e.target.value)} /></label>
          <label>
            <Label>Linked game</Label>
            <select className={field} value={form.game_id} onChange={(e) => set("game_id", e.target.value)}>
              <option value="">None</option>
              {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <label className="sm:col-span-2"><Label>Image URL</Label><input className={field} value={form.image_url} onChange={(e) => set("image_url", e.target.value)} /></label>
          <label><Label>Sort order</Label><input type="number" className={field} value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} /></label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Active</label>
        </div>
        <div className="mt-4 flex gap-2">
          <button className={primary} onClick={save}>{editing ? "Save changes" : "Add banner"}</button>
          {editing ? <button className={btn} onClick={() => { setEditing(null); setForm({ ...empty }); }}>Cancel</button> : null}
        </div>
      </div>

      <div className="space-y-2">
        {banners.map((b) => (
          <div key={b.id} className="glass-panel flex items-center justify-between gap-3 rounded-2xl p-3">
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold">{b.title}</p>
              <p className="truncate text-[11px] text-faint">{b.subtitle ?? ""} {b.is_active ? "" : "· hidden"}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button className={btn} onClick={() => edit(b)}>Edit</button>
              <button className={btn} onClick={() => remove(b.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Orders ---------------- */

function OrdersTab() {
  const qc = useQueryClient();
  const { data: orders = [] } = useQuery(ordersQuery("all"));
  const { data: games = [] } = useQuery(gamesQuery({ includeInactive: true }));
  const { data: packs = [] } = useQuery(packsQuery(undefined, { includeInactive: true }));

  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Order updated");
    qc.invalidateQueries({ queryKey: ["orders"] });
  }

  if (!orders.length) return <p className="text-sm text-faint">No orders yet.</p>;

  return (
    <div className="space-y-2">
      {orders.map((o) => {
        const game = games.find((g) => g.id === o.game_id);
        const pack = packs.find((p) => p.id === o.package_id);
        return (
          <div key={o.id} className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3">
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold">
                {game?.name ?? "Game"} · {pack?.label ?? "Package"}
              </p>
              <p className="text-[11px] text-faint">
                ID {o.player_ref}
                {o.player_server ? ` · Server ${o.player_server}` : ""} · {money(o.amount)} ·{" "}
                {new Date(o.created_at).toLocaleString()}
              </p>
            </div>
            <select
              className="glass-panel rounded-xl px-3 py-2 text-xs capitalize outline-none"
              value={o.status}
              onChange={(e) => setStatus(o.id, e.target.value)}
            >
              {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Admins ---------------- */

const ACCOUNT_DOMAIN = "moobit.app";

function AdminsTab() {
  const listAdminsFn = useServerFn(listAdmins);
  const listInvitesFn = useServerFn(listAdminInvites);
  const addFn = useServerFn(addAdminByEmail);
  const removeFn = useServerFn(removeAdmin);
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const admins = useQuery({ queryKey: ["admins"], queryFn: () => listAdminsFn({}) });
  const invites = useQuery({ queryKey: ["admin-invites"], queryFn: () => listInvitesFn({}) });

  function toEmail(v: string) {
    const t = v.trim().toLowerCase();
    return t.includes("@") ? t : `${t}@${ACCOUNT_DOMAIN}`;
  }

  async function add() {
    if (!value.trim()) {
      toast.error("Enter a username or email");
      return;
    }
    setBusy(true);
    try {
      const res = await addFn({ data: { email: toEmail(value) } });
      toast.success(res.invite ? "Saved — they become admin on first sign-in" : "Admin access granted");
      setValue("");
      qc.invalidateQueries({ queryKey: ["admins"] });
      qc.invalidateQueries({ queryKey: ["admin-invites"] });
    } catch {
      toast.error("Could not add that admin");
    }
    setBusy(false);
  }

  async function drop(input: { userId?: string; email?: string }) {
    try {
      await removeFn({ data: input });
      qc.invalidateQueries({ queryKey: ["admins"] });
      qc.invalidateQueries({ queryKey: ["admin-invites"] });
      toast.success("Admin access removed");
    } catch {
      toast.error("Could not remove that admin");
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <div className="glass-panel rounded-2xl p-4">
        <p className="font-display text-sm font-semibold">Add special login</p>
        <p className="mt-1 text-[11px] text-faint">
          Enter a username (or email). If the account doesn't exist yet, it becomes admin on first
          sign-in.
        </p>
        <div className="mt-3 flex gap-2">
          <input className={field} value={value} onChange={(e) => setValue(e.target.value)} placeholder="username" />
          <button className={primary} disabled={busy} onClick={add}>Add</button>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-wider text-faint">Current admins</p>
          <div className="space-y-2">
            {(admins.data ?? []).map((a) => (
              <div key={a.id} className="glass-panel flex items-center justify-between gap-3 rounded-2xl p-3">
                <p className="truncate text-xs">{a.email.replace(`@${ACCOUNT_DOMAIN}`, "")}</p>
                <button className={btn} onClick={() => drop({ userId: a.id, email: a.email })}>Remove</button>
              </div>
            ))}
            {admins.data?.length === 0 ? <p className="text-xs text-faint">No admins listed.</p> : null}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-wider text-faint">Pending invites</p>
          <div className="space-y-2">
            {(invites.data ?? []).map((i: { id: string; email: string }) => (
              <div key={i.id} className="glass-panel flex items-center justify-between gap-3 rounded-2xl p-3">
                <p className="truncate text-xs">{i.email.replace(`@${ACCOUNT_DOMAIN}`, "")}</p>
                <button className={btn} onClick={() => drop({ email: i.email })}>Remove</button>
              </div>
            ))}
            {invites.data?.length === 0 ? <p className="text-xs text-faint">No pending invites.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Clients ---------------- */

function ClientsTab() {
  const clientsFn = useServerFn(listClients);
  const { data = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: () => clientsFn({}),
  });
  const [q, setQ] = useState("");

  const rows = data.filter((c) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return (
      c.username.toLowerCase().includes(needle) ||
      c.display_name.toLowerCase().includes(needle) ||
      c.phone.includes(needle)
    );
  });

  if (isLoading) return <p className="text-sm text-faint">Loading clients…</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          className={`${field} sm:max-w-xs`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search username or number"
        />
        <p className="text-[11px] text-faint">{rows.length} client{rows.length === 1 ? "" : "s"}</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-faint">No clients found.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <div
              key={c.id}
              className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-semibold">
                  {c.username || c.display_name || "Unnamed"}
                </p>
                <p className="truncate text-[11px] text-faint">
                  {c.phone ? c.phone : "No number"} · joined{" "}
                  {new Date(c.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right text-[11px] text-faint">
                <p className="font-display text-sm font-semibold text-ink">{money(c.spent)}</p>
                <p>
                  {c.orders} order{c.orders === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Discount ---------------- */

function DiscountTab() {
  const qc = useQueryClient();
  const { data: settings } = useQuery(settingsQuery());
  const [value, setValue] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) setValue(String(settings.discount_percent));
  }, [settings]);

  const percent = Math.min(Math.max(Number(value) || 0, 0), 100);

  async function save() {
    if (Number(value) < 0 || Number(value) > 100 || Number.isNaN(Number(value))) {
      toast.error("Enter a number between 0 and 100");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("site_settings")
      .upsert({ id: true, discount_percent: percent }, { onConflict: "id" });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(percent ? `${percent}% off applied site-wide` : "Discount turned off");
    qc.invalidateQueries({ queryKey: ["site-settings"] });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <div className="glass-panel rounded-2xl p-4">
        <p className="font-display text-sm font-semibold">Global discount</p>
        <p className="mt-1 text-[11px] text-faint">
          Applies to every recharge pack across the whole site. Set 0 to turn it off.
        </p>
        <label className="mt-3 block">
          <Label>Discount %</Label>
          <input
            type="number"
            min={0}
            max={100}
            className={field}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <button className={`${primary} mt-4`} disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save discount"}
        </button>
      </div>

      <div className="glass-panel rounded-2xl p-4">
        <p className="font-display text-sm font-semibold">Preview</p>
        <div className="mt-3 space-y-2 text-sm">
          {[199, 499, 999].map((p) => (
            <div key={p} className="flex items-center justify-between">
              <span className="text-faint line-through">{money(p)}</span>
              <span className="font-display font-semibold">
                {money(Math.round(p * (1 - percent / 100)))}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-faint">
          Currently live: {settings?.discount_percent ?? 0}% off
        </p>
      </div>
    </div>
  );
}
