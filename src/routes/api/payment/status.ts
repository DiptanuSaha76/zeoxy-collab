import { createFileRoute } from "@tanstack/react-router";
const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export const Route = createFileRoute("/api/payment/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const clientTxnId = url.searchParams.get("txn")?.trim() || "";

          if (!clientTxnId) {
            return Response.json(
              { ok: false, message: "txn is required" },
              { status: 400, headers: jsonHeaders },
            );
          }

          // Reuse the same authentication mechanism as protected server functions.
          // This endpoint is intentionally kept as a normal route. The browser
          // must be authenticated before it can read its own payment status.
          // Authorization is checked manually below using the bearer token.
          const authHeader = request.headers.get("authorization");

          if (!authHeader?.startsWith("Bearer ")) {
            return Response.json(
              { ok: false, message: "Unauthorized" },
              { status: 401, headers: jsonHeaders },
            );
          }

          const token = authHeader.slice("Bearer ".length).trim();

          const { supabaseAdmin } =
            await import("@/integrations/supabase/client.server");

          const { data: claims, error: claimsError } =
            await supabaseAdmin.auth.getClaims(token);

          if (claimsError || !claims?.claims?.sub) {
            return Response.json(
              { ok: false, message: "Unauthorized" },
              { status: 401, headers: jsonHeaders },
            );
          }

          const userId = claims.claims.sub;

          const { data: order, error } =
            await (supabaseAdmin as any)
              .from("orders")
              .select(
                "id, status, payment_status, payment_remark, upiqrx_client_txn_id, upiqrx_upi_txn_id, smile_order_id",
              )
              .eq("user_id", userId)
              .eq("upiqrx_client_txn_id", clientTxnId)
              .maybeSingle();

          if (error) throw error;

          if (!order) {
            return Response.json(
              { ok: false, message: "Payment order not found" },
              { status: 404, headers: jsonHeaders },
            );
          }

          return Response.json(
            {
              ok: true,
              orderId: order.id,
              status: order.status,
              paymentStatus: order.payment_status,
              paymentRemark: order.payment_remark,
              upiTxnId: order.upiqrx_upi_txn_id,
              smileOrderId: order.smile_order_id,
            },
            { headers: jsonHeaders },
          );
        } catch (error) {
          console.error("[Payment status]", error);

          return Response.json(
            {
              ok: false,
              message:
                error instanceof Error
                  ? error.message
                  : "Could not read payment status",
            },
            { status: 500, headers: jsonHeaders },
          );
        }
      },
    },
  },
});
