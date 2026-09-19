import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { orderPricing, type CoinRate } from "@/lib/pricing";

const schema = z.object({
  gameId: z.string().uuid(),
  packageId: z.string().uuid(),
  playerRef: z.string().trim().min(1).max(60),
  playerServer: z.string().trim().max(20).nullable().optional(),
});

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((data) => schema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [{ data: pack, error: packErr }, { data: rate }, { data: settings }] = await Promise.all([
      supabase
        .from("packages")
        .select("id, game_id, price, smile_coin_cost, is_active")
        .eq("id", data.packageId)
        .maybeSingle(),
      supabase.from("coin_rates").select("*").eq("is_active", true).maybeSingle(),
      supabase.from("site_settings").select("discount_percent").maybeSingle(),
    ]);

    if (packErr) throw packErr;
    if (!pack || !pack.is_active || pack.game_id !== data.gameId) {
      throw new Error("That recharge pack is not available");
    }

    const activeRate = rate
      ? ({
          ...rate,
          money_spent: Number(rate.money_spent),
          coins_received: Number(rate.coins_received),
          coin_rate: Number(rate.coin_rate),
          profit_percent: Number(rate.profit_percent),
        } as CoinRate)
      : null;

    // Prices are always recalculated server-side, never trusted from the client.
    const pricing = orderPricing(
      { price: Number(pack.price), smile_coin_cost: Number(pack.smile_coin_cost ?? 0) },
      activeRate,
      Number(settings?.discount_percent ?? 0),
    );

    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        user_id: userId,
        game_id: data.gameId,
        package_id: data.packageId,
        player_ref: data.playerRef,
        player_server: data.playerServer ?? null,
        amount: pricing.amount,
        smile_coin_cost: pricing.smile_coin_cost,
        coin_rate: pricing.coin_rate,
        real_cost: pricing.real_cost,
        profit_percent: pricing.profit_percent,
        selling_price: pricing.selling_price,
        profit: pricing.profit,
      })
      .select("id")
      .single();

    if (error) throw error;
    return { id: order.id, amount: pricing.amount };
  });
