import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

const searchSchema = z.object({
  txn: z.string().optional(),
  order: z.string().optional(),
});

export const Route = createFileRoute("/payment/pending")({
  validateSearch: searchSchema,
  component: PaymentPendingPage,
});

function PaymentPendingPage() {
  const navigate = useNavigate();
  const { txn, order } = Route.useSearch();
  const [message, setMessage] = useState("Checking your payment…");

  useEffect(() => {
    if (!txn) {
      navigate({ to: "/payment/failed", search: { order: order ?? "" } });
      return;
    }

    let stopped = false;

    const check = async () => {
      try {
        const session =
          await import("@/integrations/supabase/client").then(
            ({ supabase }) => supabase.auth.getSession(),
          );

        const token = session.data.session?.access_token;

        if (!token) {
          setMessage("Your session expired. Please sign in again.");
          return;
        }

        const response = await fetch(
          `/api/payment/status?txn=${encodeURIComponent(txn)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const result = await response.json();

        if (stopped) return;

        if (!response.ok) {
          setMessage(result?.message || "Waiting for payment status…");
          return;
        }

        if (result.status === "completed") {
          navigate({
            to: "/payment/success",
            search: { order: result.orderId ?? order ?? "" },
            replace: true,
          });
          return;
        }

        if (
          result.status === "failed" ||
          result.paymentStatus === "failed"
        ) {
          navigate({
            to: "/payment/failed",
            search: {
              order: result.orderId ?? order ?? "",
            },
            replace: true,
          });
          return;
        }

        setMessage(
          result.status === "processing"
            ? "Payment received. Your recharge is being processed…"
            : "Waiting for payment confirmation…",
        );
      } catch {
        if (!stopped) {
          setMessage("Waiting for payment confirmation…");
        }
      }
    };

    void check();

    const interval = window.setInterval(() => {
      void check();
    }, 2500);

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [navigate, order, txn]);

  return (
    <main className="min-h-screen px-5 py-10 font-body">
      <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center">
        <div className="glass-panel w-full rounded-3xl p-7 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-violet/15 text-2xl">
            ⏳
          </div>

          <h1 className="mt-5 font-display text-2xl font-semibold">
            Payment processing
          </h1>

          <p className="mt-2 text-sm text-faint">{message}</p>

          <div className="mt-6 rounded-2xl bg-white/5 p-3 text-xs text-faint">
            Please do not close this page while we confirm your payment.
          </div>
        </div>
      </div>
    </main>
  );
}
