import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/payment/success")({
  validateSearch: (search: Record<string, unknown>) => ({
    order:
      typeof search.order === "string"
        ? search.order
        : "",
  }),
  component: PaymentSuccessPage,
});

function PaymentSuccessPage() {
  const { order } = Route.useSearch();

  return (
    <main className="min-h-screen px-5 py-10 font-body">
      <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center">
        <div className="glass-panel w-full rounded-3xl p-7 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-lime/15 text-3xl text-lime">
            ✓
          </div>

          <p className="mt-5 text-xs uppercase tracking-[0.2em] text-lime">
            Payment successful
          </p>

          <h1 className="mt-2 font-display text-3xl font-semibold">
            Thank you!
          </h1>

          <p className="mt-3 text-sm text-faint">
            Your payment was received and the recharge order has been
            completed.
          </p>

          {order ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-3 text-left text-xs text-faint">
              <span className="text-subtle">Order ID</span>
              <div className="mt-1 break-all font-mono text-[11px]">
                {order}
              </div>
            </div>
          ) : null}

          <Link
            to="/orders"
            className="brand-gradient mt-6 block w-full rounded-2xl py-3.5 font-display text-sm font-semibold text-ink"
          >
            View My Orders
          </Link>

          <Link
            to="/"
            className="mt-3 block text-xs text-faint hover:text-ink"
          >
            Back to store
          </Link>
        </div>
      </div>
    </main>
  );
}
