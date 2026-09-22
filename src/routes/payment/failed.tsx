import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/payment/failed")({
  validateSearch: (search: Record<string, unknown>) => ({
    order:
      typeof search.order === "string"
        ? search.order
        : "",
  }),
  component: PaymentFailedPage,
});

function PaymentFailedPage() {
  const { order } = Route.useSearch();

  return (
    <main className="min-h-screen px-5 py-10 font-body">
      <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center">
        <div className="glass-panel w-full rounded-3xl p-7 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-rose/15 text-3xl text-rose">
            ×
          </div>

          <p className="mt-5 text-xs uppercase tracking-[0.2em] text-rose">
            Payment not completed
          </p>

          <h1 className="mt-2 font-display text-3xl font-semibold">
            Payment failed
          </h1>

          <p className="mt-3 text-sm text-faint">
            We could not complete this payment. No successful recharge was
            recorded for this transaction.
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
            to="/"
            className="brand-gradient mt-6 block w-full rounded-2xl py-3.5 font-display text-sm font-semibold text-ink"
          >
            Try Again
          </Link>

          <Link
            to="/orders"
            className="mt-3 block text-xs text-faint hover:text-ink"
          >
            View My Orders
          </Link>
        </div>
      </div>
    </main>
  );
}
