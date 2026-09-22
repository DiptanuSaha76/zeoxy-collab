import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function smileSign(params: Record<string, string>, key: string) {
  const source =
    Object.keys(params)
      .sort((a, b) => a.localeCompare(b))
      .map((k) => `${k}=${params[k]}&`)
      .join("") + key;

  const first = createHash("md5").update(source, "utf8").digest("hex");
  return createHash("md5").update(first, "utf8").digest("hex");
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
    // handled below
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

  return json as any;
}

function dateToSmileFormat(value: string | undefined) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}-${m}-${y}`;
  }

  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("day")}-${get("month")}-${get("year")}`;
}

async function verifyUpiqrxStatus(clientTxnId: string, txnDate?: string) {
  const key = process.env["UPIQ_RX_API_KEY"]?.trim();

  if (!key) {
    throw new Error("Missing UPIQRX_API_KEY");
  }

  const payload = {
    key,
    client_txn_id: clientTxnId,
    txn_date: dateToSmileFormat(txnDate),
  };

  const response = await fetch(
    "https://api.upiqrx.in/api/check_order_status",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.status) {
    throw new Error(
      data?.msg || "UPIQRX status verification failed",
    );
  }

  return data.data;
}

export const Route = createFileRoute("/api/payment/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const contentType =
            request.headers.get("content-type")?.toLowerCase() ?? "";

          if (!contentType.includes("application/x-www-form-urlencoded")) {
            return Response.json(
              { ok: false, message: "Expected form-urlencoded webhook" },
              { status: 400, headers: jsonHeaders },
            );
          }

          const raw = await request.text();
          const form = new URLSearchParams(raw);

          const clientTxnId =
            form.get("client_txn_id")?.trim() || "";

          if (!clientTxnId) {
            return Response.json(
              { ok: false, message: "client_txn_id is required" },
              { status: 400, headers: jsonHeaders },
            );
          }

          const { supabaseAdmin } =
            await import("@/integrations/supabase/client.server");

          const { data: order, error: orderError } =
            await (supabaseAdmin as any)
              .from("orders")
              .select(
                "id, game_id, package_id, player_ref, player_server, selling_price, status, payment_status, upiqrx_client_txn_id, smile_product_id",
              )
              .eq("upiqrx_client_txn_id", clientTxnId)
              .maybeSingle();

          if (orderError) throw orderError;

          if (!order) {
            return Response.json(
              { ok: false, message: "Order not found" },
              { status: 404, headers: jsonHeaders },
            );
          }

          // Idempotency: do not process a webhook twice.
          if (
            order.payment_status === "paid" ||
            order.status === "completed"
          ) {
            return Response.json(
              { ok: true, duplicate: true },
              { headers: jsonHeaders },
            );
          }

          const gatewayTxn = await verifyUpiqrxStatus(
            clientTxnId,
            form.get("txnAt") ?? undefined,
          );

          const gatewayAmount = Number(gatewayTxn?.amount);
          const expectedAmount = Number(order.selling_price);

          if (
            !Number.isFinite(gatewayAmount) ||
            Math.abs(gatewayAmount - expectedAmount) > 0.01
          ) {
            await (supabaseAdmin as any)
              .from("orders")
              .update({
                status: "failed",
                payment_status: "failed",
                payment_remark: "Payment amount mismatch",
              })
              .eq("id", order.id)
              .eq("payment_status", "pending");

            return Response.json(
              { ok: false, message: "Payment amount mismatch" },
              { status: 400, headers: jsonHeaders },
            );
          }

          if (String(gatewayTxn?.status ?? "").toLowerCase() !== "success") {
            await (supabaseAdmin as any)
              .from("orders")
              .update({
                status: "failed",
                payment_status: "failed",
                payment_remark:
                  String(gatewayTxn?.remark ?? "Payment failed").slice(0, 500),
              })
              .eq("id", order.id)
              .eq("payment_status", "pending");

            return Response.json(
              { ok: true, payment: "failed" },
              { headers: jsonHeaders },
            );
          }

          // Claim this paid order atomically before calling Smile One,
          // preventing duplicate delivery if UPIQRX retries the webhook.
          const { data: claimed, error: claimError } =
            await (supabaseAdmin as any)
              .from("orders")
              .update({
                status: "processing",
                payment_status: "paid",
                upiqrx_upi_txn_id:
                  String(gatewayTxn?.upi_txn_id ?? "").trim() || null,
                payment_remark:
                  String(gatewayTxn?.remark ?? "").slice(0, 500) || null,
                paid_at: new Date().toISOString(),
              })
              .eq("id", order.id)
              .eq("payment_status", "pending")
              .select("id")
              .maybeSingle();

          if (claimError) throw claimError;

          if (!claimed) {
            return Response.json(
              { ok: true, duplicate: true },
              { headers: jsonHeaders },
            );
          }

          const { data: game, error: gameError } =
            await (supabaseAdmin as any)
              .from("games")
              .select("slug")
              .eq("id", order.game_id)
              .maybeSingle();

          if (gameError) throw gameError;

          if (!game?.slug || !order.smile_product_id) {
            throw new Error(
              "Missing game slug or Smile One product ID for delivery",
            );
          }

          const email = process.env["SMILE_ONE_EMAIL"]?.trim();
          const uid = process.env["SMILE_ONE_UID"]?.trim();
          const key = process.env["SMILE_ONE_KEY"]?.trim();
          const baseUrl =
            process.env["SMILE_ONE_API_URL"]?.trim() ||
            "https://www.smile.one";

          if (!email || !uid || !key) {
            throw new Error("Smile One server configuration is incomplete");
          }

          const roleParams: Record<string, string> = {
            email,
            uid,
            userid: String(order.player_ref),
            zoneid: String(order.player_server ?? ""),
            product: smileProductName(game.slug),
            productid: String(order.smile_product_id),
            time: String(Math.floor(Date.now() / 1000)),
          };

          const smileResult = await smilePost(
            `${baseUrl}/smilecoin/api/createorder`,
            {
              ...roleParams,
              sign: smileSign(roleParams, key),
            },
          );

          if (Number(smileResult?.status) !== 200) {
            const message =
              smileResult?.message || "Smile One delivery failed";

            await (supabaseAdmin as any)
              .from("orders")
              .update({
                status: "failed",
                smile_status: "failed",
                smile_remark: String(message).slice(0, 500),
              })
              .eq("id", order.id);

            return Response.json(
              { ok: false, message },
              { status: 502, headers: jsonHeaders },
            );
          }

          await (supabaseAdmin as any)
            .from("orders")
            .update({
              status: "completed",
              smile_status: "success",
              smile_order_id:
                smileResult?.order_id != null
                  ? String(smileResult.order_id)
                  : null,
              smile_remark:
                String(smileResult?.message ?? "success").slice(0, 500),
              completed_at: new Date().toISOString(),
            })
            .eq("id", order.id);

          return Response.json(
            {
              ok: true,
              payment: "success",
              delivery: "completed",
            },
            { headers: jsonHeaders },
          );
        } catch (error) {
          console.error("[UPIQRX webhook]", error);

          return Response.json(
            {
              ok: false,
              message:
                error instanceof Error
                  ? error.message
                  : "Webhook processing failed",
            },
            { status: 500, headers: jsonHeaders },
          );
        }
      },
    },
  },
});
