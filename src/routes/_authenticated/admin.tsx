import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";

import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  ORDER_STATUSES,
  activeCoinRateQuery,
  bannersQuery,
  coinRatesQuery,
  gamesQuery,
  money,
  ordersQuery,
  packsQuery,
  settingsQuery,
  uploadStoreImage,
  type Banner,
  type Game,
  type Order,
  type Pack,
} from "@/lib/store";
import { coinRateOf, computePricing, customerPrice, round2, type CoinRate } from "@/lib/pricing";
import {
  addAdmin,
  listAdminInvites,
  listAdmins,
  listClients,
  removeAdmin,
  reorderGames,
} from "@/lib/admin.functions";
import {
  assignSmileProduct,
  listSmileProducts,
  type SmileProduct,
} from "@/lib/smile.functions";

const uploadGameImage = uploadStoreImage;

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin panel — Zeoxy TopUp Store" },
      { name: "description", content: "Manage games, packages, banners, orders and admins." },
      { property: "og:title", content: "Admin panel — Zeoxy TopUp Store" },
      { property: "og:description", content: "Manage games, packages, banners, orders and admins." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

const TABS = [
  "Dashboard",
  "Games",
  "Packages",
  "Banners",
  "Orders",
  "Clients",
  "Smile Products",
  "Smile Coin",
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
  const [tab, setTab] = useState<Tab>("Dashboard");

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
    <div className="min-w-0 w-full overflow-x-clip px-4 py-6 sm:px-6">
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
        {tab === "Dashboard" && <DashboardTab />}
        {tab === "Games" && <GamesTab />}
        {tab === "Packages" && <PackagesTab />}
        {tab === "Banners" && <BannersTab />}
        {tab === "Orders" && <OrdersTab />}
        {tab === "Clients" && <ClientsTab />}
        {tab === "Smile Products" && <SmileProductsTab />}
        {tab === "Smile Coin" && <SmileCoinTab />}
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
function SortableGameRow({
  g,
  onEdit,
  onToggle,
  onRemove,
}: {
  g: Game;
  onEdit: (g: Game) => void;
  onToggle: (g: Game) => void;
  onRemove: (g: Game) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: g.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`glass-panel flex min-w-0 w-full flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center sm:justify-between ${isDragging ? "opacity-60" : ""
        }`}
    >
      <div className="flex min-w-0 w-full flex-1 items-center gap-3">
        <button
          type="button"
          aria-label={`Reorder ${g.name}`}
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab touch-none select-none rounded-lg px-2 py-1 text-faint hover:text-ink active:cursor-grabbing"
        >
          ⠿
        </button>

        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold">
            {g.name}
          </p>

          <p className="truncate text-[11px] text-faint">
            /{g.slug} · {g.category} · {g.id_label}
            {g.requires_server_id ? " + server" : ""}
            {g.is_active ? "" : " · hidden"}
          </p>
        </div>
      </div>

      <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">
        <button
          type="button"
          className={btn}
          onClick={() => onEdit(g)}
        >
          Edit
        </button>

        <button
          type="button"
          className={btn}
          onClick={() => onToggle(g)}
        >
          {g.is_active ? "Deactivate" : "Activate"}
        </button>

        <button
          type="button"
          className={`${btn} border-rose/40 text-rose`}
          onClick={() => onRemove(g)}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
function GamesTab() {
  const qc = useQueryClient();
  const { data: games = [] } = useQuery(gamesQuery({ includeInactive: true }));
  const [form, setForm] = useState<GameForm>({ ...emptyGame });
  const [editing, setEditing] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [order, setOrder] = useState<string[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);

  const reorderFn = useServerFn(reorderGames);

  const set = <K extends keyof GameForm>(k: K, v: GameForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  useEffect(() => {
    setOrder((prev) => {
      const isDirty =
        prev.length === games.length &&
        prev.some((id, i) => id !== games[i]?.id);

      if (!prev.length || !isDirty) {
        return games.map((g) => g.id);
      }

      const ids = new Set(games.map((g) => g.id));
      const kept = prev.filter((id) => ids.has(id));
      const keptSet = new Set(kept);

      return [
        ...kept,
        ...games.map((g) => g.id).filter((id) => !keptSet.has(id)),
      ];
    });
  }, [games]);

  const orderedGames = order
    .map((id) => games.find((g) => g.id === id))
    .filter((g): g is Game => Boolean(g));

  const orderDirty =
    order.length === games.length &&
    order.some((id, i) => id !== games[i]?.id);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;

    if (!over || active.id === over.id) return;

    setOrder((prev) =>
      arrayMove(
        prev,
        prev.indexOf(String(active.id)),
        prev.indexOf(String(over.id)),
      ),
    );
  }

  async function saveOrder() {
    setSavingOrder(true);

    try {
      await reorderFn({
        data: {
          order: orderedGames.map((g, i) => ({
            id: g.id,
            sort_order: i,
          })),
        },
      });

      toast.success("Game order saved");

      await qc.invalidateQueries({
        queryKey: ["games"],
      });
    } catch (error) {
      console.error("SAVE ORDER ERROR:", error);

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      toast.error(`Could not save order: ${message}`);
    } finally {
      setSavingOrder(false);
    }
  }
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
    <div className="grid min-w-0 w-full gap-5 lg:grid-cols-[1fr_1.1fr] lg:items-start">
      <div className="glass-panel order-2 min-w-0 w-full rounded-2xl p-4 lg:order-none">
        <p className="font-display text-sm font-semibold">{editing ? "Edit game" : "Add game"}</p>
        <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
          <label><Label>Name</Label><input className={field} value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
          <label><Label>Slug</Label><input className={field} value={form.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"))} /></label>
          <label><Label>Category</Label><input className={field} value={form.category} onChange={(e) => set("category", e.target.value)} /></label>
          <label><Label>Currency label</Label><input className={field} value={form.currency_label} onChange={(e) => set("currency_label", e.target.value)} /></label>
          <div className="sm:col-span-2">
            <Label>Cover image</Label>
            <div className="flex min-w-0 flex-wrap items-center gap-3">
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
                      const url = await uploadGameImage(file, "games");
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
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.requires_server_id} onChange={(e) => set("requires_server_id", e.target.checked)} /> Needs server / zone ID</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Active</label>
        </div>
        <div className="mt-4 flex gap-2">
          <button className={primary} onClick={save}>{editing ? "Save changes" : "Add game"}</button>
          {editing ? <button className={btn} onClick={() => { setEditing(null); setForm({ ...emptyGame }); }}>Cancel</button> : null}
        </div>
      </div>

      <div className="order-1 min-w-0 w-full space-y-2 lg:order-none">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] uppercase tracking-wider text-faint">
            Drag to reorder
          </p>

          <button
            type="button"
            className={primary}
            disabled={!orderDirty || savingOrder}
            onClick={saveOrder}
          >
            {savingOrder ? "Saving…" : "Save Order"}
          </button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={orderedGames.map((g) => g.id)}
            strategy={verticalListSortingStrategy}
          >
            {orderedGames.map((g) => (
              <SortableGameRow
                key={g.id}
                g={g}
                onEdit={edit}
                onToggle={toggleActive}
                onRemove={remove}
              />
            ))}
          </SortableContext>
        </DndContext>
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
  const { data: rate } = useQuery(activeCoinRateQuery());
  const { data: settings } = useQuery(settingsQuery());

  type PackForm = {
    label: string;
    amount: string;
    price: string;
    smile_coin_cost: string;
    smile_product_id: string;
    bonus_text: string;
    is_popular: boolean;
    is_active: boolean;
    sort_order: string;
  };
  const empty: PackForm = {
    label: "",
    amount: "0",
    price: "0",
    smile_coin_cost: "0",
    smile_product_id: "",
    bonus_text: "",
    is_popular: false,
    is_active: true,
    sort_order: "0",
  };
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
    const coins = Number(form.smile_coin_cost);
    if (Number.isNaN(coins) || coins < 0) {
      toast.error("Smile Coin cost must be zero or more");
      return;
    }

    if (!form.smile_product_id.trim()) {
      toast.error("Smile Product ID is required");
      return;
    }

    const payload = {
      game_id: gameId,
      label: form.label.trim(),
      amount: Number(form.amount) || 0,
      price: Number(form.price) || 0,
      smile_coin_cost: Number(form.smile_coin_cost) || 0,
      smile_product_id: form.smile_product_id.trim(),
      bonus_text: form.bonus_text || null,
      is_popular: form.is_popular,
      is_active: form.is_active,
      sort_order: Number(form.sort_order) || 0,
    };
    const packagesTable = supabase.from("packages") as any;

    const { error } = editing
      ? await packagesTable.update(payload).eq("id", editing)
      : await packagesTable.insert(payload);
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
      smile_coin_cost: String(p.smile_coin_cost ?? 0),
      smile_product_id: String(
        (p as Pack & { smile_product_id?: string | number }).smile_product_id ?? "",
      ),
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
          <label>
            <Label>Smile Coin cost</Label>
            <input
              type="number"
              min={0}
              step="0.01"
              className={field}
              value={form.smile_coin_cost}
              onChange={(e) =>
                set("smile_coin_cost", e.target.value)
              }
              placeholder="65"
            />
          </label>
          <label>
            <Label>Smile Product ID</Label>
            <input
              className={field}
              value={form.smile_product_id}
              onChange={(e) =>
                set("smile_product_id", e.target.value)
              }
              placeholder="e.g. 123456"
            />
          </label>
          <p className="sm:col-span-2 -mt-1 text-[10px] text-faint">
            Enter the Smile One product ID here so this package is ready for checkout immediately.
          </p>
          <label><Label>Fallback price (Rs.)</Label><input type="number" className={field} value={form.price} onChange={(e) => set("price", e.target.value)} /></label>
          <label><Label>Sort order</Label><input type="number" className={field} value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} /></label>
          <label className="sm:col-span-2"><Label>Bonus text</Label><input className={field} value={form.bonus_text} onChange={(e) => set("bonus_text", e.target.value)} placeholder="+50 bonus" /></label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.is_popular} onChange={(e) => set("is_popular", e.target.checked)} /> Popular</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Active</label>
        </div>
        {(() => {
          const preview = computePricing(
            { price: Number(form.price) || 0, smile_coin_cost: Number(form.smile_coin_cost) || 0 },
            rate,
          );
          const shown = customerPrice(
            { price: Number(form.price) || 0, smile_coin_cost: Number(form.smile_coin_cost) || 0 },
            rate,
            settings?.discount_percent ?? 0,
          );
          return (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-[11px] text-faint">
              <p className="mb-1 font-display text-xs font-semibold text-subtle">Price preview</p>
              {rate ? (
                <>
                  <p>Coin rate: Rs. {round2(rate.coin_rate)} per coin</p>
                  <p>Real cost: {money(preview.real_cost)} · Profit {preview.profit_percent}%</p>
                </>
              ) : (
                <p>No active Smile Coin rate — the fallback price is used.</p>
              )}
              <p className="mt-1 font-display text-sm font-semibold text-ink">
                Customer pays {money(shown)}
              </p>
            </div>
          );
        })()}
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
              <p className="text-[11px] text-faint">
                {money(customerPrice(p, rate, settings?.discount_percent ?? 0))}
                {p.smile_coin_cost ? ` · ${p.smile_coin_cost} coins` : ""}
                {(p as Pack & { smile_product_id?: string | number }).smile_product_id
                  ? ` · Product ${String(
                      (p as Pack & { smile_product_id?: string | number }).smile_product_id,
                    )}`
                  : ""}
                {p.is_popular ? " · popular" : ""}
                {p.is_active ? "" : " · hidden"}
              </p>
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
  const [uploading, setUploading] = useState(false);
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
          <div className="sm:col-span-2">
            <Label>Banner image</Label>
            <div className="flex items-center gap-3">
              {form.image_url ? (
                <img
                  src={form.image_url}
                  alt="Banner preview"
                  className="h-16 w-28 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <div className="h-16 w-28 shrink-0 rounded-xl bg-muted" />
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
                      const url = await uploadStoreImage(file, "banners");
                      set("image_url", url);
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
                  value={form.image_url}
                  onChange={(e) => set("image_url", e.target.value)}
                  placeholder="…or paste an image link"
                />
              </div>
            </div>
            {uploading ? <p className="mt-1 text-[11px] text-faint">Uploading…</p> : null}
          </div>
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
  type PaymentAwareOrder = Order & {
    payment_status?: string | null;
    payment_remark?: string | null;
    paid_at?: string | null;
    upiqrx_client_txn_id?: string | null;
    upiqrx_order_id?: string | null;
    upiqrx_payment_url?: string | null;
    upiqrx_upi_txn_id?: string | null;
    smile_product_id?: string | null;
    smile_order_id?: string | null;
    smile_status?: string | null;
    smile_remark?: string | null;
    completed_at?: string | null;
  };

  const qc = useQueryClient();
  const [selectedOrder, setSelectedOrder] =
    useState<PaymentAwareOrder | null>(null);

  /*
   * Read the full order row here instead of the old ordersQuery projection so
   * the Admin Orders screen can immediately see the payment lifecycle fields.
   *
   * This is intentionally cast locally because Supabase generated types may
   * lag behind a newly-added column until types.ts is regenerated.
   */
  const ordersQueryAdmin = useQuery({
    queryKey: ["orders", "admin-payment-aware"],
    queryFn: async (): Promise<PaymentAwareOrder[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      return (data ?? []) as unknown as PaymentAwareOrder[];
    },
    refetchInterval: 4000,
    refetchOnWindowFocus: true,
  });

  const { data: orders = [], isLoading, error: ordersError } =
    ordersQueryAdmin;

  const { data: games = [] } = useQuery(
    gamesQuery({ includeInactive: true }),
  );
  const { data: packs = [] } = useQuery(
    packsQuery(undefined, { includeInactive: true }),
  );

  function paymentStatus(order: PaymentAwareOrder) {
    const raw = String(order.payment_status ?? "").toLowerCase();

    if (raw === "paid" || raw === "success") return "paid";
    if (raw === "failed") return "failed";

    // Backward compatibility for orders created before payment_status existed.
    if (order.status === "completed" || order.status === "processing") {
      return "paid";
    }

    return "pending";
  }

  function paymentClasses(status: string) {
    if (status === "paid") {
      return "border-lime/30 bg-lime/10 text-lime";
    }
    if (status === "failed") {
      return "border-rose/30 bg-rose/10 text-rose";
    }
    return "border-amber/30 bg-amber/10 text-amber";
  }

  function deliveryClasses(status: string) {
    if (status === "completed") {
      return "border-lime/30 bg-lime/10 text-lime";
    }
    if (status === "failed") {
      return "border-rose/30 bg-rose/10 text-rose";
    }
    if (status === "processing") {
      return "border-violet/30 bg-violet/10 text-violet";
    }
    return "border-amber/30 bg-amber/10 text-amber";
  }

  async function setStatus(
    order: PaymentAwareOrder,
    status: string,
  ) {
    const payment = paymentStatus(order);

    if (
      (status === "processing" || status === "completed") &&
      payment !== "paid"
    ) {
      toast.error(
        "Cannot mark delivery as processing/completed before payment is confirmed.",
      );
      return;
    }

    const { error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", order.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Delivery status updated");
    await qc.invalidateQueries({
      queryKey: ["orders", "admin-payment-aware"],
    });
    await qc.invalidateQueries({
      queryKey: ["orders"],
    });

    setSelectedOrder((current) =>
      current?.id === order.id
        ? { ...current, status }
        : current,
    );
  }

  if (isLoading) {
    return (
      <div className="glass-panel rounded-2xl p-4">
        <p className="text-sm text-faint">Loading orders…</p>
      </div>
    );
  }

  if (ordersError) {
    return (
      <div className="glass-panel rounded-2xl p-4">
        <p className="text-sm text-rose">
          Could not load orders:{" "}
          {ordersError instanceof Error
            ? ordersError.message
            : "Unknown error"}
        </p>
      </div>
    );
  }

  if (!orders.length) {
    return (
      <div className="glass-panel rounded-2xl p-4">
        <p className="text-sm text-faint">No orders yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-sm font-semibold">
              Payment-aware orders
            </p>
            <p className="mt-1 text-[11px] text-faint">
              Payment updates automatically from UPIQRX. Delivery status is
              updated by the Smile One fulfillment flow.
            </p>
          </div>

          <div className="text-[11px] text-faint">
            Auto-refreshing · {orders.length} order
            {orders.length === 1 ? "" : "s"}
          </div>
        </div>

        {orders.map((o) => {
          const game = games.find((g) => g.id === o.game_id);
          const pack = packs.find((p) => p.id === o.package_id);
          const payment = paymentStatus(o);
          const delivery = String(o.status || "pending").toLowerCase();

          return (
            <div
              key={o.id}
              className="glass-panel rounded-2xl p-3 sm:p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setSelectedOrder(o)}
                >
                  <p className="font-display text-sm font-semibold">
                    {game?.name ?? "Game"} ·{" "}
                    {pack?.label ?? "Package"}
                  </p>

                  <p className="mt-1 truncate text-[11px] text-faint">
                    ID {o.player_ref}
                    {o.player_server
                      ? ` · Server ${o.player_server}`
                      : ""}{" "}
                    · {money(Number(o.selling_price || o.amount || 0))}
                  </p>

                  <p className="mt-1 text-[10px] text-faint">
                    {new Date(o.created_at).toLocaleString()}
                  </p>
                </button>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${paymentClasses(payment)}`}
                  >
                    Payment · {payment}
                  </span>

                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${deliveryClasses(delivery)}`}
                  >
                    Delivery · {delivery}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
                <div className="min-w-0 space-y-1 text-[10px] text-faint">
                  {o.upiqrx_upi_txn_id ? (
                    <p className="truncate">
                      UPI Txn:{" "}
                      <span className="text-subtle">
                        {o.upiqrx_upi_txn_id}
                      </span>
                    </p>
                  ) : o.upiqrx_client_txn_id ? (
                    <p className="truncate">
                      Client Txn:{" "}
                      <span className="text-subtle">
                        {o.upiqrx_client_txn_id}
                      </span>
                    </p>
                  ) : null}

                  {o.smile_order_id ? (
                    <p className="truncate">
                      Smile Order:{" "}
                      <span className="text-subtle">
                        {o.smile_order_id}
                      </span>
                    </p>
                  ) : null}

                  {o.payment_remark ? (
                    <p className="truncate">
                      {o.payment_remark}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={btn}
                    onClick={() => setSelectedOrder(o)}
                  >
                    Details
                  </button>

                  <select
                    className="glass-panel rounded-xl px-3 py-2 text-xs capitalize outline-none"
                    value={delivery}
                    onChange={(e) =>
                      void setStatus(o, e.target.value)
                    }
                  >
                    {ORDER_STATUSES.map((s) => (
                      <option
                        key={s}
                        value={s}
                        disabled={
                          (s === "processing" || s === "completed") &&
                          payment !== "paid"
                        }
                      >
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedOrder ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center sm:p-5"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) {
              setSelectedOrder(null);
            }
          }}
        >
          <div className="glass-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl p-5 sm:p-6">
            {(() => {
              const o = selectedOrder;
              const game = games.find((g) => g.id === o.game_id);
              const pack = packs.find((p) => p.id === o.package_id);
              const payment = paymentStatus(o);
              const delivery = String(
                o.status || "pending",
              ).toLowerCase();

              return (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-faint">
                        Order details
                      </p>
                      <h2 className="mt-1 truncate font-display text-lg font-semibold">
                        {game?.name ?? "Game"} ·{" "}
                        {pack?.label ?? "Package"}
                      </h2>
                    </div>

                    <button
                      type="button"
                      className={btn}
                      onClick={() => setSelectedOrder(null)}
                    >
                      Close
                    </button>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <Label>Payment</Label>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${paymentClasses(payment)}`}
                      >
                        {payment}
                      </span>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <Label>Delivery</Label>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${deliveryClasses(delivery)}`}
                      >
                        {delivery}
                      </span>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <Label>Customer</Label>
                      <p className="text-sm text-subtle">
                        {o.player_ref}
                        {o.player_server
                          ? ` · ${o.player_server}`
                          : ""}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <Label>Amount paid</Label>
                      <p className="font-display text-sm font-semibold">
                        {money(
                          Number(
                            o.selling_price ||
                              o.amount ||
                              0,
                          ),
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <Label>UPIQRX Client Txn</Label>
                      <p className="break-all font-mono text-[11px] text-subtle">
                        {o.upiqrx_client_txn_id || "—"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <Label>UPIQRX Gateway Order</Label>
                      <p className="break-all font-mono text-[11px] text-subtle">
                        {o.upiqrx_order_id || "—"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <Label>UPI / UTR</Label>
                      <p className="break-all font-mono text-[11px] text-subtle">
                        {o.upiqrx_upi_txn_id || "—"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <Label>Smile Product</Label>
                      <p className="break-all font-mono text-[11px] text-subtle">
                        {o.smile_product_id || "—"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <Label>Smile Order</Label>
                      <p className="break-all font-mono text-[11px] text-subtle">
                        {o.smile_order_id || "—"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <Label>Created</Label>
                      <p className="text-[11px] text-subtle">
                        {new Date(o.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {(o.payment_remark ||
                    o.smile_remark ||
                    o.paid_at ||
                    o.completed_at) ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
                      <Label>Timeline / remarks</Label>

                      {o.paid_at ? (
                        <p className="text-[11px] text-faint">
                          Paid ·{" "}
                          {new Date(o.paid_at).toLocaleString()}
                        </p>
                      ) : null}

                      {o.completed_at ? (
                        <p className="mt-1 text-[11px] text-faint">
                          Completed ·{" "}
                          {new Date(
                            o.completed_at,
                          ).toLocaleString()}
                        </p>
                      ) : null}

                      {o.payment_remark ? (
                        <p className="mt-2 text-[11px] text-faint">
                          Payment: {o.payment_remark}
                        </p>
                      ) : null}

                      {o.smile_remark ? (
                        <p className="mt-1 text-[11px] text-faint">
                          Smile: {o.smile_remark}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-wrap justify-end gap-2">
                    {o.upiqrx_payment_url &&
                    payment === "pending" ? (
                      <a
                        href={o.upiqrx_payment_url}
                        target="_blank"
                        rel="noreferrer"
                        className={btn}
                      >
                        Open Payment
                      </a>
                    ) : null}

                    <button
                      type="button"
                      className={primary}
                      onClick={() =>
                        void qc.invalidateQueries({
                          queryKey: [
                            "orders",
                            "admin-payment-aware",
                          ],
                        })
                      }
                    >
                      Refresh
                    </button>

                    <button
                      type="button"
                      className={btn}
                      onClick={() => setSelectedOrder(null)}
                    >
                      Done
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ---------------- Admins ---------------- */

function AdminsTab() {
  const listAdminsFn = useServerFn(listAdmins);
  const listInvitesFn = useServerFn(listAdminInvites);
  const addFn = useServerFn(addAdmin);
  const removeFn = useServerFn(removeAdmin);
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const admins = useQuery({ queryKey: ["admins"], queryFn: () => listAdminsFn({}) });
  const invites = useQuery({ queryKey: ["admin-invites"], queryFn: () => listInvitesFn({}) });

  async function add() {
    if (!value.trim()) {
      toast.error("Enter a username or email");
      return;
    }
    setBusy(true);
    try {
      const res = await addFn({ data: { identifier: value.trim() } });
      if (!res.ok) {
        toast.error(res.message);
        setBusy(false);
        return;
      }
      toast.success("Admin access granted");
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
          Enter the username or email of an existing account to give it admin access.
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
                <p className="truncate text-xs">{a.username || a.email}</p>
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
                <p className="truncate text-xs">{i.email}</p>
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

/* ---------------- Smile Products ---------------- */

function SmileProductsTab() {
  const listFn = useServerFn(listSmileProducts);
  const assignFn = useServerFn(assignSmileProduct);

  const { data: games = [] } = useQuery(
    gamesQuery({ includeInactive: true }),
  );

  const [gameId, setGameId] = useState("");
  const [productCode, setProductCode] = useState("");
  const [products, setProducts] = useState<SmileProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [packageId, setPackageId] = useState("");

  const { data: packs = [] } = useQuery({
    ...packsQuery(gameId || undefined, { includeInactive: true }),
    enabled: Boolean(gameId),
  });

  const selectedGame = games.find((g) => g.id === gameId);

  useEffect(() => {
    if (!gameId && games.length) {
      const first = games[0]!;
      setGameId(first.id);
      setProductCode(
        first.slug.replace(/[^a-zA-Z0-9]/g, "").toLowerCase(),
      );
      return;
    }

    if (selectedGame) {
      setProductCode(
        selectedGame.slug.replace(/[^a-zA-Z0-9]/g, "").toLowerCase(),
      );
      setProducts([]);
      setPackageId("");
    }
  }, [gameId, games, selectedGame]);

  useEffect(() => {
    if (!packageId && packs.length) {
      setPackageId(packs[0]!.id);
    } else if (packageId && !packs.some((p) => p.id === packageId)) {
      setPackageId(packs[0]?.id ?? "");
    }
  }, [packs, packageId]);

  async function loadProducts() {
    if (!productCode.trim()) {
      toast.error("Enter the Smile product name");
      return;
    }

    setLoading(true);
    try {
      const result = await listFn({
        data: { product: productCode.trim() },
      });
      setProducts(result.products);
      if (!result.products.length) {
        toast.error("Smile One returned no products for this product name");
      } else {
        toast.success(`Loaded ${result.products.length} Smile products`);
      }
    } catch (error) {
      console.error("[SmileProducts] Load error:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not load Smile One products",
      );
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }

  async function assign(product: SmileProduct) {
    if (!packageId) {
      toast.error("Select a recharge package first");
      return;
    }

    setAssigning(String(product.id));
    try {
      await assignFn({
        data: {
          packageId,
          smileProductId: String(product.id),
        },
      });
      toast.success(`Mapped Smile product ${product.id} to the selected pack`);
    } catch (error) {
      console.error("[SmileProducts] Assign error:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not assign this Smile product",
      );
    } finally {
      setAssigning(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="glass-panel rounded-2xl p-4">
        <p className="font-display text-sm font-semibold">
          Smile One Product List
        </p>
        <p className="mt-1 text-[11px] text-faint">
          Load the exact product IDs returned by Smile One. These IDs are
          required by the Role Query and Purchase APIs.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label>
            <Label>Game</Label>
            <select
              className={field}
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
            >
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <Label>Smile product name</Label>
            <input
              className={field}
              value={productCode}
              onChange={(e) => setProductCode(e.target.value)}
              placeholder="mobilelegends"
            />
          </label>
        </div>

        <button
          type="button"
          className={`${primary} mt-4`}
          disabled={loading || !productCode.trim()}
          onClick={loadProducts}
        >
          {loading ? "Loading products…" : "Load Smile Products"}
        </button>
      </div>

      {products.length ? (
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-sm font-semibold">
                Map a product ID
              </p>
              <p className="mt-1 text-[11px] text-faint">
                Select the Zeoxy recharge pack, then assign the exact Smile
                product ID.
              </p>
            </div>

            <div className="w-full sm:w-72">
              <Label>Zeoxy recharge pack</Label>
              <select
                className={field}
                value={packageId}
                onChange={(e) => setPackageId(e.target.value)}
              >
                {packs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} · {p.amount}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {products.map((product) => (
              <div
                key={String(product.id)}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"
              >
                <div className="min-w-0">
                  <p className="font-display text-sm font-semibold">
                    Product ID: {product.id}
                  </p>
                  <p className="mt-0.5 text-[11px] text-faint">
                    {product.spu || "No SPU description"}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-subtle">
                    Rs. {product.price}
                  </span>
                  <button
                    type="button"
                    className={btn}
                    disabled={assigning === String(product.id)}
                    onClick={() => assign(product)}
                  >
                    {assigning === String(product.id) ? "Assigning…" : "Assign"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-faint">
          No Smile products loaded yet.
        </p>
      )}
    </div>
  );
}

/* ---------------- Smile Coin pricing ---------------- */

function SmileCoinTab() {
  const qc = useQueryClient();
  const { data: rate } = useQuery(activeCoinRateQuery());
  const { data: history = [] } = useQuery(coinRatesQuery());
  const { data: settings } = useQuery(settingsQuery());
  const { data: packs = [] } = useQuery(packsQuery(undefined, { includeInactive: true }));
  const { data: games = [] } = useQuery(gamesQuery({ includeInactive: true }));

  const [money_spent, setMoneySpent] = useState("100");
  const [coins, setCoins] = useState("100");
  const [profit, setProfit] = useState("20");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const spentN = Number(money_spent);
  const coinsN = Number(coins);
  const profitN = Number(profit);
  const valid =
    Number.isFinite(spentN) && spentN > 0 &&
    Number.isFinite(coinsN) && coinsN > 0 &&
    Number.isFinite(profitN) && profitN >= 0;

  const draft: CoinRate | null = valid
    ? {
      id: "draft",
      money_spent: spentN,
      coins_received: coinsN,
      coin_rate: coinRateOf(spentN, coinsN),
      profit_percent: profitN,
      is_active: true,
      note: null,
      created_at: new Date().toISOString(),
    }
    : null;

  const discount = settings?.discount_percent ?? 0;
  const pricedPacks = packs.filter((p) => p.smile_coin_cost > 0).slice(0, 12);

  async function apply() {
    if (!valid || !draft) {
      toast.error("Enter money spent, coins received and a profit % greater than zero");
      return;
    }
    if (
      !window.confirm(
        `Apply new rate? Rs. ${round2(draft.coin_rate)} per coin with ${profitN}% profit — every package price updates instantly.`,
      )
    )
      return;
    setSaving(true);
    const { error: offErr } = await supabase
      .from("coin_rates")
      .update({ is_active: false })
      .eq("is_active", true);
    if (offErr) {
      setSaving(false);
      toast.error(offErr.message);
      return;
    }
    const { error } = await supabase.from("coin_rates").insert({
      money_spent: spentN,
      coins_received: coinsN,
      coin_rate: round2(coinRateOf(spentN, coinsN) * 10000) / 10000,
      profit_percent: profitN,
      is_active: true,
      note: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("New Smile Coin rate is live");
    setNote("");
    qc.invalidateQueries({ queryKey: ["coin-rate"] });
    qc.invalidateQueries({ queryKey: ["coin-rates"] });
    qc.invalidateQueries({ queryKey: ["packages"] });
  }

  async function reactivate(r: CoinRate) {
    if (!window.confirm("Make this older rate active again?")) return;
    await supabase.from("coin_rates").update({ is_active: false }).eq("is_active", true);
    const { error } = await supabase.from("coin_rates").update({ is_active: true }).eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Rate restored");
    qc.invalidateQueries({ queryKey: ["coin-rate"] });
    qc.invalidateQueries({ queryKey: ["coin-rates"] });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr] lg:items-start">
      <div className="space-y-4">
        <div className="glass-panel rounded-2xl p-4">
          <p className="font-display text-sm font-semibold">New Smile Coin rate</p>
          <p className="mt-1 text-[11px] text-faint">
            Enter what you paid and how many coins you received. Every package price recalculates
            automatically.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label>
              <Label>Money spent (Rs.)</Label>
              <input type="number" min={0} step="0.01" className={field} value={money_spent} onChange={(e) => setMoneySpent(e.target.value)} />
            </label>
            <label>
              <Label>Coins received</Label>
              <input type="number" min={0} step="0.01" className={field} value={coins} onChange={(e) => setCoins(e.target.value)} />
            </label>
            <label>
              <Label>Profit %</Label>
              <input type="number" min={0} step="0.01" className={field} value={profit} onChange={(e) => setProfit(e.target.value)} />
            </label>
            <label className="sm:col-span-3">
              <Label>Note (optional)</Label>
              <input className={field} value={note} onChange={(e) => setNote(e.target.value)} placeholder="USDT at 105" />
            </label>
          </div>
          {!valid ? (
            <p className="mt-2 text-[11px] text-rose">
              Money spent and coins received must be greater than zero.
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-faint">
              New coin rate: <span className="text-subtle">Rs. {round2(coinRateOf(spentN, coinsN) * 10000) / 10000}</span> per coin
            </p>
          )}
          <button className={`${primary} mt-4`} disabled={!valid || saving} onClick={apply}>
            {saving ? "Applying…" : "Preview & apply rate"}
          </button>
        </div>

        <div className="glass-panel rounded-2xl p-4">
          <p className="font-display text-sm font-semibold">Currently live</p>
          {rate ? (
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-faint sm:grid-cols-4">
              <div><p className="text-subtle">Rs. {rate.money_spent}</p><p>spent</p></div>
              <div><p className="text-subtle">{rate.coins_received}</p><p>coins</p></div>
              <div><p className="text-subtle">Rs. {round2(rate.coin_rate * 10000) / 10000}</p><p>per coin</p></div>
              <div><p className="text-subtle">{rate.profit_percent}%</p><p>profit</p></div>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-faint">No active rate yet — fallback prices are used.</p>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-4">
          <p className="font-display text-sm font-semibold">Rate history</p>
          <div className="mt-3 space-y-2">
            {history.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 p-2.5">
                <div className="min-w-0">
                  <p className="text-xs">
                    Rs. {r.money_spent} → {r.coins_received} coins · {r.profit_percent}% profit
                  </p>
                  <p className="text-[11px] text-faint">
                    {new Date(r.created_at).toLocaleString()}
                    {r.note ? ` · ${r.note}` : ""}
                    {r.is_active ? " · active" : ""}
                  </p>
                </div>
                {r.is_active ? (
                  <span className="rounded-full border border-cyan/30 bg-cyan/10 px-2 py-0.5 text-[10px] text-cyan">Live</span>
                ) : (
                  <button className={btn} onClick={() => reactivate(r)}>Restore</button>
                )}
              </div>
            ))}
            {history.length === 0 ? <p className="text-[11px] text-faint">No rates yet.</p> : null}
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-4">
        <p className="font-display text-sm font-semibold">Price preview with the new rate</p>
        <p className="mt-1 text-[11px] text-faint">
          Customer prices include the {discount}% site discount.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="text-faint">
              <tr>
                <th className="py-1.5 pr-2 font-normal">Package</th>
                <th className="py-1.5 pr-2 font-normal">Coins</th>
                <th className="py-1.5 pr-2 font-normal">Cost</th>
                <th className="py-1.5 pr-2 font-normal">Now</th>
                <th className="py-1.5 font-normal">New</th>
              </tr>
            </thead>
            <tbody>
              {pricedPacks.map((p) => {
                const game = games.find((g) => g.id === p.game_id);
                const now = customerPrice(p, rate, discount);
                const next = customerPrice(p, draft, discount);
                return (
                  <tr key={p.id} className="border-t border-white/10">
                    <td className="py-1.5 pr-2">
                      <span className="text-subtle">{p.label}</span>
                      <span className="text-faint"> · {game?.name ?? ""}</span>
                    </td>
                    <td className="py-1.5 pr-2 text-faint">{p.smile_coin_cost}</td>
                    <td className="py-1.5 pr-2 text-faint">
                      {money(computePricing(p, draft).real_cost)}
                    </td>
                    <td className="py-1.5 pr-2 text-faint">{money(now)}</td>
                    <td className="py-1.5 font-display font-semibold">{money(next)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pricedPacks.length === 0 ? (
            <p className="text-[11px] text-faint">
              No packages have a Smile Coin cost yet — add one in the Packages tab.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */

const RANGES = ["Today", "7 Days", "30 Days", "This Month", "All Time", "Custom"] as const;
type Range = (typeof RANGES)[number];

function rangeStart(range: Range): Date | null {
  const now = new Date();
  if (range === "Today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "7 Days") return new Date(now.getTime() - 7 * 86400000);
  if (range === "30 Days") return new Date(now.getTime() - 30 * 86400000);
  if (range === "This Month") return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}

function Donut({ cost, profit }: { cost: number; profit: number }) {
  const total = cost + profit;
  const r = 52;
  const c = 2 * Math.PI * r;
  const costLen = total > 0 ? (cost / total) * c : 0;
  return (
    <svg viewBox="0 0 140 140" className="size-40 shrink-0 -rotate-90">
      <circle cx="70" cy="70" r={r} fill="none" strokeWidth="16" className="stroke-white/10" />
      {total > 0 ? (
        <>
          <circle
            cx="70" cy="70" r={r} fill="none" strokeWidth="16" strokeLinecap="round"
            stroke="oklch(0.72 0.14 200)"
            strokeDasharray={`${costLen} ${c - costLen}`}
          />
          <circle
            cx="70" cy="70" r={r} fill="none" strokeWidth="16" strokeLinecap="round"
            stroke="oklch(0.68 0.19 310)"
            strokeDasharray={`${c - costLen} ${costLen}`}
            strokeDashoffset={-costLen}
          />
        </>
      ) : null}
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-panel rounded-2xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-faint">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold">{value}</p>
    </div>
  );
}

function DashboardTab() {
  const { data: orders = [], isLoading } = useQuery(ordersQuery("all"));
  const { data: packs = [] } = useQuery(packsQuery(undefined, { includeInactive: true }));
  const { data: games = [] } = useQuery(gamesQuery({ includeInactive: true }));
  const [range, setRange] = useState<Range>("30 Days");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const counted = orders.filter((o: Order) => {
    if (o.status !== "completed") return false;
    const at = new Date(o.created_at);
    if (range === "Custom") {
      if (from && at < new Date(from)) return false;
      if (to && at > new Date(`${to}T23:59:59`)) return false;
      return true;
    }
    const start = rangeStart(range);
    return !start || at >= start;
  });

  const sales = round2(counted.reduce((s, o) => s + Number(o.selling_price || o.amount), 0));
  const cost = round2(counted.reduce((s, o) => s + Number(o.real_cost), 0));
  const profit = round2(sales - cost);
  const aov = counted.length ? round2(sales / counted.length) : 0;

  const perPack = packs
    .map((p) => {
      const mine = counted.filter((o) => o.package_id === p.id);
      const s = round2(mine.reduce((sum, o) => sum + Number(o.selling_price || o.amount), 0));
      const c = round2(mine.reduce((sum, o) => sum + Number(o.real_cost), 0));
      return {
        id: p.id,
        label: p.label,
        game: games.find((g) => g.id === p.game_id)?.name ?? "",
        orders: mine.length,
        sales: s,
        cost: c,
        profit: round2(s - c),
      };
    })
    .filter((r) => r.orders > 0)
    .sort((a, b) => b.sales - a.sales);

  if (isLoading) return <p className="text-sm text-faint">Loading dashboard…</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={
              r === range
                ? "brand-gradient rounded-full px-3 py-1.5 font-display text-[11px] font-semibold text-ink"
                : "glass-panel rounded-full px-3 py-1.5 text-[11px]"
            }
          >
            {r}
          </button>
        ))}
        {range === "Custom" ? (
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" className={`${field} w-auto`} value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-[11px] text-faint">to</span>
            <input type="date" className={`${field} w-auto`} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total sales" value={money(sales)} />
        <Stat label="Total cost" value={money(cost)} />
        <Stat label="Total profit" value={money(profit)} />
        <Stat label="Orders" value={String(counted.length)} />
        <Stat label="Avg order value" value={money(aov)} />
      </div>

      <div className="glass-panel flex flex-wrap items-center gap-6 rounded-2xl p-5">
        <div className="relative">
          <Donut cost={cost} profit={profit} />
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-faint">Total sales</p>
              <p className="font-display text-lg font-semibold">{money(sales)}</p>
            </div>
          </div>
        </div>
        <div className="space-y-2 text-xs">
          <p className="flex items-center gap-2">
            <span className="size-3 rounded-full" style={{ background: "oklch(0.72 0.14 200)" }} />
            Total cost · {money(cost)}
          </p>
          <p className="flex items-center gap-2">
            <span className="size-3 rounded-full" style={{ background: "oklch(0.68 0.19 310)" }} />
            Total profit · {money(profit)}
          </p>
          <p className="text-[11px] text-faint">Completed orders only.</p>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-4">
        <p className="font-display text-sm font-semibold">Package performance</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-faint">
              <tr>
                <th className="py-2 pr-3 font-normal">Package</th>
                <th className="py-2 pr-3 font-normal">Orders</th>
                <th className="py-2 pr-3 font-normal">Sales</th>
                <th className="py-2 pr-3 font-normal">Cost</th>
                <th className="py-2 font-normal">Profit</th>
              </tr>
            </thead>
            <tbody>
              {perPack.map((r) => (
                <tr key={r.id} className="border-t border-white/10">
                  <td className="py-2 pr-3">
                    {r.label} <span className="text-faint">· {r.game}</span>
                  </td>
                  <td className="py-2 pr-3 text-faint">{r.orders}</td>
                  <td className="py-2 pr-3">{money(r.sales)}</td>
                  <td className="py-2 pr-3 text-faint">{money(r.cost)}</td>
                  <td className="py-2 font-display font-semibold">{money(r.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {perPack.length === 0 ? (
            <p className="text-[11px] text-faint">No completed orders in this period.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}