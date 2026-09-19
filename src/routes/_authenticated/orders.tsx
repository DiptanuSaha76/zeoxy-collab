import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { gamesQuery, money, ordersQuery, packsQuery } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({
    meta: [
      { title: "My orders — Recharge" },
      { name: "description", content: "Track the status of every game top-up you ordered." },
      { property: "og:title", content: "My orders — Recharge" },
      { property: "og:description", content: "Track the status of every game top-up you ordered." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrdersPage,
});

const statusTone: Record<string, string> = {
  pending: "text-amber-400",
  processing: "text-cyan-400",
  completed: "text-emerald-400",
  failed: "text-rose-400",
};

function OrdersPage() {
  const { user } = useAuth();
  const { data: orders = [], isLoading } = useQuery({
    ...ordersQuery("mine", user?.id),
    enabled: Boolean(user?.id),
  });
  const { data: games = [] } = useQuery(gamesQuery({ includeInactive: true }));
  const { data: packs = [] } = useQuery(packsQuery(undefined, { includeInactive: true }));

  return (
    <div className="px-4 py-6 sm:px-6">
      <h1 className="font-display text-2xl font-semibold">My orders</h1>
      <p className="mt-1 text-xs text-faint">Every top-up you placed, newest first.</p>

      {isLoading ? (
        <p className="mt-8 text-sm text-faint">Loading your orders…</p>
      ) : orders.length === 0 ? (
        <div className="glass-panel mt-6 rounded-3xl p-8 text-center">
          <p className="text-sm text-subtle">You haven't placed any top-ups yet.</p>
          <Link
            to="/"
            className="brand-gradient mt-4 inline-block rounded-2xl px-5 py-3 font-display text-sm font-semibold text-ink"
          >
            Browse games
          </Link>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {orders.map((o) => {
            const game = games.find((g) => g.id === o.game_id);
            const pack = packs.find((p) => p.id === o.package_id);
            return (
              <div key={o.id} className="glass-panel rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-sm font-semibold">{game?.name ?? "Game"}</p>
                    <p className="mt-0.5 text-xs text-subtle">{pack?.label ?? "Package"}</p>
                  </div>
                  <p className="font-display text-sm font-semibold">{money(o.amount)}</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-faint">
                  <span>ID: {o.player_ref}</span>
                  {o.player_server ? <span>Server: {o.player_server}</span> : null}
                  <span>{new Date(o.created_at).toLocaleString()}</span>
                  <span className={`font-medium capitalize ${statusTone[o.status] ?? "text-subtle"}`}>
                    {o.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
