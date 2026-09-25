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

type SmileRoleResponse = {
  status?: number;
  username?: string;
  message?: string;
};

type SmileCreateOrderResponse = {
  status?: number;
  message?: string;
  order_id?: string | number;
};

async function smileSign(
  params: Record<string, string>,
  key: string,
): Promise<string> {
  // Load Node crypto only when the server function executes.
  // This prevents Vite from trying to bundle node:crypto into the browser.
  const { createHash } = await import("node:crypto");

  const source =
    Object.keys(params)
      .sort((a, b) => a.localeCompare(b))
      .map((k) => `${k}=${params[k]}&`)
      .join("") + key;

  const first = createHash("md5")
    .update(source, "utf8")
    .digest("hex");

  return createHash("md5")
    .update(first, "utf8")
    .digest("hex");
}

function smileProductName(slug: string) {
  const map: Record<string, string> = {
    "mobile-legends": "mobilelegends",
    "free-fire": "freefire",
    "pubg-mobile": "pubgmobile",
    "genshin-impact": "genshinimpact",
    bgmi: "pubgmobile",
  };

  return (
    map[slug] ??
    slug.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
  );
}

async function smilePost(
  url: string,
  params: Record<string, string>,
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(params),
  });

  const raw = await response.text();

  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    // Keep raw response for error reporting.
  }

  if (!response.ok) {
    throw new Error(
      `Smile One HTTP ${response.status}: ${
        typeof json === "object" && json !== null
          ? JSON.stringify(json)
          : raw.slice(0, 300)
      }`,
    );
  }

  return json;
}

function getSmileConfig() {
  const email = process.env["SMILE_ONE_EMAIL"]?.trim();
  const uid = process.env["SMILE_ONE_UID"]?.trim();
  const key = process.env["SMILE_ONE_KEY"]?.trim();
  const baseUrl =
    process.env["SMILE_ONE_API_URL"]?.trim() ||
    "https://www.smile.one";

  if (!email || !uid || !key) {
    throw new Error(
      "Missing SMILE_ONE_EMAIL, SMILE_ONE_UID or SMILE_ONE_KEY",
    );
  }

  return { email, uid, key, baseUrl };
}

async function verifySmileRole(args: {
  slug: string;
  productId: string;
  playerRef: string;
  playerServer: string;
}) {
  const { email, uid, key, baseUrl } = getSmileConfig();

  const product = smileProductName(args.slug);

  const params: Record<string, string> = {
    email,
    uid,
    userid: args.playerRef,
    zoneid: args.playerServer,
    product,
    productid: args.productId,
    time: String(Math.floor(Date.now() / 1000)),
  };

  const result = (await smilePost(
    `${baseUrl}/smilecoin/api/getrole`,
    {
      ...params,
      sign: await smileSign(params, key),
    },
  )) as SmileRoleResponse;

  if (result?.status !== 200) {
    throw new Error(
      result?.message || "Smile One could not verify this account",
    );
  }

  const nickname = String(result.username ?? "").trim();

  if (!nickname) {
    throw new Error("Smile One returned no username");
  }

  return nickname;
}

async function createSmileOrder(args: {
  slug: string;
  productId: string;
  playerRef: string;
  playerServer: string;
}) {
  const { email, uid, key, baseUrl } = getSmileConfig();

  const params: Record<string, string> = {
    email,
    uid,
    userid: args.playerRef,
    zoneid: args.playerServer,
    product: smileProductName(args.slug),
    productid: args.productId,
    time: String(Math.floor(Date.now() / 1000)),
  };

  const result = (await smilePost(
    `${baseUrl}/smilecoin/api/createorder`,
    {
      ...params,
      sign: await smileSign(params, key),
    },
  )) as SmileCreateOrderResponse;

  if (result?.status !== 200) {
    throw new Error(
      result?.message || "Smile One purchase failed",
    );
  }

  const orderId = String(result.order_id ?? "").trim();

  if (!orderId) {
    throw new Error("Smile One returned no order ID");
  }

  return {
    orderId,
    message: result.message || "success",
  };
}

export const createUpiPayment = createServerFn({ method: "POST" })
  .inputValidator((data) => schema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");

    const [
      { data: game, error: gameError },
      { data: pack, error: packError },
      { data: rate },
      { data: settings },
      { data: profile },
      { data: authUser, error: authUserError },
    ] = await Promise.all([
      supabaseAdmin
        .from("games")
        .select("id, slug, name, is_active")
        .eq("id", data.gameId)
        .maybeSingle(),
      supabaseAdmin
        .from("packages")
        .select(
          "id, game_id, label, amount, price, smile_coin_cost, smile_product_id, is_active",
        )
        .eq("id", data.packageId)
        .maybeSingle(),
      supabaseAdmin
        .from("coin_rates")
        .select("*")
        .eq("is_active", true)
        .maybeSingle(),
      supabaseAdmin
        .from("site_settings")
        .select("discount_percent")
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("display_name, phone")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin.auth.admin.getUserById(userId),
    ]);

    if (gameError) throw gameError;
    if (packError) throw packError;
    if (authUserError) throw authUserError;

    if (!game || !game.is_active) {
      throw new Error("This game is not available");
    }

    if (!pack || !pack.is_active || pack.game_id !== data.gameId) {
      throw new Error("That recharge pack is not available");
    }

    const smileProductId = String(
      (pack as any).smile_product_id ?? "",
    ).trim();

    if (!smileProductId) {
      throw new Error(
        "This recharge pack is not linked to a Smile One product",
      );
    }

    const activeRate = rate
      ? ({
          ...(rate as any),
          money_spent: Number((rate as any).money_spent),
          coins_received: Number((rate as any).coins_received),
          coin_rate: Number((rate as any).coin_rate),
          profit_percent: Number((rate as any).profit_percent),
        } as CoinRate)
      : null;

    const pricing = orderPricing(
      {
        price: Number(pack.price),
        smile_coin_cost: Number(pack.smile_coin_cost ?? 0),
      },
      activeRate,
      Number(settings?.discount_percent ?? 0),
    );

    if (!Number.isFinite(pricing.selling_price) || pricing.selling_price <= 0) {
      throw new Error("Invalid payment amount");
    }

    const playerRef = data.playerRef.trim();
    const playerServer = data.playerServer?.trim() || "";

    // Re-verify the role server-side. Never rely only on the browser's
    // previously displayed "Verified" state.
    const nickname = await verifySmileRole({
      slug: game.slug,
      productId: smileProductId,
      playerRef,
      playerServer,
    });

   const clientTxnId =
  `ZEOXY${Date.now()}${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

    const { data: createdOrder, error: createOrderError } =
      await (supabaseAdmin as any)
        .from("orders")
        .insert({
          user_id: userId,
          game_id: game.id,
          package_id: pack.id,
          player_ref: playerRef,
          player_server: playerServer || null,
          amount: pricing.amount,
          smile_coin_cost: pricing.smile_coin_cost,
          coin_rate: pricing.coin_rate,
          real_cost: pricing.real_cost,
          profit_percent: pricing.profit_percent,
          selling_price: pricing.selling_price,
          profit: pricing.profit,
          status: "pending",
          payment_status: "pending",
          upiqrx_client_txn_id: clientTxnId,
          smile_product_id: smileProductId,
        })
        .select("id")
        .single();

    if (createOrderError) throw createOrderError;

    const publicAppUrl =
      process.env["PUBLIC_APP_URL"]?.trim() ||
      "http://localhost:8080";

    const gatewayKey =
      process.env["UPIQ_RX_API_KEY"]?.trim();

    if (!gatewayKey) {
      await (supabaseAdmin as any)
        .from("orders")
        .update({
          status: "failed",
          payment_status: "failed",
          payment_remark: "Missing UPIQRX_API_KEY",
        })
        .eq("id", createdOrder.id);

      throw new Error("Missing UPIQRX_API_KEY");
    }

    const customerEmail =
      authUser.user?.email?.trim() || "";
    const customerName =
      String(profile?.display_name ?? "").trim() ||
      customerEmail ||
      "Zeoxy Customer";
    // Mobiles are stored in E.164 (+919876543210) for accounts created after
    // the OTP change; the gateway wants plain local digits.
    const customerMobile =
      String(profile?.phone ?? "")
        .replace(/\D/g, "")
        .slice(-10) || "9999999999";

    const gatewayResponse = await fetch(
      "https://api.upiqrx.in/api/create_order",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: gatewayKey,
          client_txn_id: clientTxnId,
          amount: Number(pricing.selling_price).toFixed(2),
          p_info: `${game.name} - ${pack.label}`,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_mobile: customerMobile,
          redirect_url:
            `${publicAppUrl}/payment/pending?txn=${encodeURIComponent(clientTxnId)}` +
            `&order=${encodeURIComponent(createdOrder.id)}`,
          udf1: String(createdOrder.id).slice(0, 25),
          udf2: nickname.slice(0, 25),
          udf3: "",
        }),
      },
    );

    const gateway = await gatewayResponse.json().catch(() => null);

    if (!gatewayResponse.ok || !gateway?.status) {
      const message =
        gateway?.msg || "UPIQRX order creation failed";

      await (supabaseAdmin as any)
        .from("orders")
        .update({
          status: "failed",
          payment_status: "failed",
          payment_remark: message,
        })
        .eq("id", createdOrder.id);

      throw new Error(message);
    }

    const paymentUrl =
      String(gateway.data?.payment_url ?? "").trim();

    if (!paymentUrl) {
      await (supabaseAdmin as any)
        .from("orders")
        .update({
          status: "failed",
          payment_status: "failed",
          payment_remark: "UPIQRX returned no payment_url",
        })
        .eq("id", createdOrder.id);

      throw new Error("UPIQRX returned no payment_url");
    }

    await (supabaseAdmin as any)
      .from("orders")
      .update({
        upiqrx_order_id:
          gateway.data?.order_id != null
            ? String(gateway.data.order_id)
            : null,
        upiqrx_payment_url: paymentUrl,
        payment_status: "pending",
        status: "pending",
      })
      .eq("id", createdOrder.id);

    return {
      ok: true,
      orderId: createdOrder.id,
      clientTxnId,
      paymentUrl,
      amount: pricing.selling_price,
    };
  });

export { createSmileOrder };