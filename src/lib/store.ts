import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { round2, type CoinRate } from "@/lib/pricing";

export type { CoinRate };

export type Game = {
  id: string;
  name: string;
  slug: string;
  category: string;
  cover_url: string | null;
  currency_label: string;
  id_label: string;
  id_kind: "text" | "numeric";
  id_min_len: number;
  id_max_len: number;
  id_help: string | null;
  requires_server_id: boolean;
  server_label: string;
  is_active: boolean;
  sort_order: number;
};

export type Banner = {
  id: string;
  title: string;
  subtitle: string | null;
  badge: string | null;
  image_url: string | null;
  game_id: string | null;
  is_active: boolean;
  sort_order: number;
};

export type Pack = {
  id: string;
  game_id: string;
  label: string;
  amount: number;
  price: number;
  smile_coin_cost: number;
  smile_product_id: string | null;
  bonus_text: string | null;
  is_popular: boolean;
  is_active: boolean;
  sort_order: number;
};

export type Order = {
  id: string;
  player_ref: string;
  player_server: string | null;
  amount: number;
  status: string;
  created_at: string;
  game_id: string | null;
  package_id: string | null;
  user_id?: string | null;
  smile_coin_cost: number;
  coin_rate: number;
  real_cost: number;
  profit_percent: number;
  selling_price: number;
  profit: number;
};

export const ORDER_STATUSES = ["pending", "processing", "completed", "failed"] as const;

export const gamesQuery = (opts?: { includeInactive?: boolean }) =>
  queryOptions({
    queryKey: ["games", opts?.includeInactive ?? false],
    queryFn: async (): Promise<Game[]> => {
      let q = supabase.from("games").select("*").order("sort_order");
      if (!opts?.includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Game[];
    },
  });

export const bannersQuery = (opts?: { includeInactive?: boolean }) =>
  queryOptions({
    queryKey: ["banners", opts?.includeInactive ?? false],
    queryFn: async (): Promise<Banner[]> => {
      let q = supabase.from("banners").select("*").order("sort_order");
      if (!opts?.includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Banner[];
    },
  });

export const packsQuery = (gameId?: string, opts?: { includeInactive?: boolean }) =>
  queryOptions({
    queryKey: ["packages", gameId ?? "all", opts?.includeInactive ?? false],
    queryFn: async (): Promise<Pack[]> => {
      let q = supabase.from("packages").select("*").order("sort_order");
      if (gameId) q = q.eq("game_id", gameId);
      if (!opts?.includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((p) => ({
        ...p,
        price: Number(p.price),
        smile_coin_cost: Number(p.smile_coin_cost ?? 0),
      })) as Pack[];
    },
  });

export const coinRatesQuery = () =>
  queryOptions({
    queryKey: ["coin-rates"],
    queryFn: async (): Promise<CoinRate[]> => {
      const { data, error } = await supabase
        .from("coin_rates")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        money_spent: Number(r.money_spent),
        coins_received: Number(r.coins_received),
        coin_rate: Number(r.coin_rate),
        profit_percent: Number(r.profit_percent),
      })) as CoinRate[];
    },
  });

export const activeCoinRateQuery = () =>
  queryOptions({
    queryKey: ["coin-rate", "active"],
    queryFn: async (): Promise<CoinRate | null> => {
      const { data, error } = await supabase
        .from("coin_rates")
        .select("*")
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        money_spent: Number(data.money_spent),
        coins_received: Number(data.coins_received),
        coin_rate: Number(data.coin_rate),
        profit_percent: Number(data.profit_percent),
      } as CoinRate;
    },
  });

export const ordersQuery = (scope: "mine" | "all", userId?: string) =>
  queryOptions({
    queryKey: ["orders", scope, userId ?? "anon"],
    queryFn: async (): Promise<Order[]> => {
      let q = supabase
        .from("orders")
        .select(
          "id, player_ref, player_server, amount, status, created_at, game_id, package_id, user_id, smile_coin_cost, coin_rate, real_cost, profit_percent, selling_price, profit",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (scope === "mine" && userId) q = q.eq("user_id", userId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((o) => ({
        ...o,
        amount: Number(o.amount),
        smile_coin_cost: Number(o.smile_coin_cost ?? 0),
        coin_rate: Number(o.coin_rate ?? 0),
        real_cost: Number(o.real_cost ?? 0),
        profit_percent: Number(o.profit_percent ?? 0),
        selling_price: Number(o.selling_price ?? 0),
        profit: Number(o.profit ?? 0),
      })) as Order[];
    },
  });

export const settingsQuery = () =>
  queryOptions({
    queryKey: ["site-settings"],
    queryFn: async (): Promise<{ discount_percent: number }> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("discount_percent")
        .maybeSingle();
      if (error) throw error;
      return { discount_percent: Number(data?.discount_percent ?? 0) };
    },
  });

export const discounted = (price: number, percent: number) => {
  const pct = Math.min(Math.max(Number(percent) || 0, 0), 100);
  return round2(price * (1 - pct / 100));
};

export async function uploadStoreImage(
  file: File,
  folder: "games" | "banners" = "games",
): Promise<string> {
  const MAX_SIZE = 5 * 1024 * 1024;

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
  ];

  // Validate file type
  if (!allowedTypes.includes(file.type)) {
    throw new Error(
      "Invalid image type. Please use JPG, PNG, WEBP, GIF or AVIF.",
    );
  }

  // Validate file size
  if (file.size > MAX_SIZE) {
    throw new Error("Image must be smaller than 5 MB.");
  }

  // Keep only a safe version of the original filename
  const originalName =
    file.name
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "image";

  const ext =
    file.name.split(".").pop()?.toLowerCase() ||
    file.type.split("/")[1] ||
    "jpg";

  const fileName = `${crypto.randomUUID()}-${originalName}.${ext}`;

  // Store images in separate folders
  const path = `${folder}/${fileName}`;

  const { error } = await supabase.storage
    .from("store-images")
    .upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
      contentType: file.type,
    });

  if (error) {
    throw error;
  }

  // store-images is a PUBLIC bucket,
  // so use a permanent public URL instead of a temporary signed URL.
  const { data } = supabase.storage
    .from("store-images")
    .getPublicUrl(path);

  if (!data?.publicUrl) {
    throw new Error("Could not generate the image URL.");
  }

  return data.publicUrl;
}

export const uploadGameImage = uploadStoreImage;

export const money = (value: number) => {
  const n = Number(value) || 0;
  const decimals = Number.isInteger(round2(n)) ? 0 : 2;
  return `Rs. ${round2(n).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

export function validatePlayerId(game: Game, value: string): string | null {
  const v = value.trim();
  if (!v) return `Enter your ${game.id_label}`;
  if (game.id_kind === "numeric" && !/^\d+$/.test(v))
    return `${game.id_label} must contain digits only`;
  if (v.length < game.id_min_len)
    return `${game.id_label} must be at least ${game.id_min_len} characters`;
  if (v.length > game.id_max_len)
    return `${game.id_label} must be at most ${game.id_max_len} characters`;
  return null;
}

export function validateServerId(game: Game, value: string): string | null {
  if (!game.requires_server_id) return null;
  const v = value.trim();
  if (!v) return `Enter your ${game.server_label}`;
  if (v.length > 20) return `${game.server_label} is too long`;
  return null;
}
