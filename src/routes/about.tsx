import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Us — Recharge" },
      {
        name: "description",
        content:
          "Recharge is a fast, secure game top-up store. Learn who we are, what we stand for, and why thousands of players trust us.",
      },
    ],
  }),
  component: About,
});

const VALUES = [
  {
    icon: "⚡",
    title: "Instant by default",
    body: "Top-ups are automated end-to-end. Most orders land in under a minute — no waiting for a human to process anything.",
  },
  {
    icon: "🔒",
    title: "Safety first",
    body: "Every payment happens on-site at checkout. We never ask for passwords, OTPs, or transfers to personal accounts.",
  },
  {
    icon: "💬",
    title: "Real support",
    body: "Direct WhatsApp lines, staffed 24/7, with a typical first reply in under five minutes. No ticket black holes.",
  },
  {
    icon: "🌍",
    title: "Local pricing",
    body: "Prices in your local currency, with regional payment methods like UPI, cards, wallets and crypto.",
  },
];

const STATS = [
  { value: "99.9%", label: "Orders fulfilled" },
  { value: "~60s", label: "Typical delivery" },
  { value: "24/7", label: "Support staffed" },
];

const DIFFERENTIATORS = [
  "No reseller middlemen — we source directly from official regional distributors.",
  "Player ID verification before payment, so top-ups never land on the wrong account.",
  "Full refunds on any undelivered order, no arguments and no fine print.",
];

function About() {
  return (
    <PageShell>
      <nav className="mt-5 flex items-center justify-between px-4 sm:px-6">
        <h1 className="font-display text-base font-semibold sm:text-xl">About us</h1>
        <span className="rounded-full border border-cyan/30 bg-cyan/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] text-cyan">
          Since 2020
        </span>
      </nav>

      <section className="mt-4 px-4 sm:px-6">
        <div className="brand-gradient rounded-3xl p-6 sm:p-8">
          <h2 className="font-display text-xl font-bold text-ink sm:text-2xl">
            Built by gamers, for gamers
          </h2>
          <p className="mt-1 max-w-xl text-sm text-ink/75">
            Recharge started with a simple frustration: topping up a game
            shouldn't take longer than playing it. So we built a store where it
            doesn't.
          </p>
        </div>
      </section>

      <section className="mt-6 px-4 sm:px-6">
        <div className="grid grid-cols-3 gap-3">
          {STATS.map((s) => (
            <div key={s.label} className="glass-panel rounded-2xl p-4 text-center">
              <p className="font-display text-lg font-bold text-cyan sm:text-2xl">
                {s.value}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-faint sm:text-[11px]">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 px-4 sm:px-6">
        <h2 className="mb-3 font-display text-sm font-medium text-subtle sm:text-base">
          What we stand for
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {VALUES.map((v) => (
            <div key={v.title} className="glass-panel rounded-2xl p-4">
              <span aria-hidden className="text-lg">{v.icon}</span>
              <h3 className="mt-2 font-display text-sm font-semibold">{v.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-faint">{v.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 px-4 sm:px-6">
        <div className="glass-panel rounded-2xl p-5">
          <h3 className="font-display text-sm font-semibold">How we're different</h3>
          <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-faint">
            {DIFFERENTIATORS.map((d) => (
              <li key={d} className="flex gap-2.5">
                <span className="text-cyan" aria-hidden>›</span>
                {d}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-6 px-4 pb-6 sm:px-6">
        <div className="glass-panel flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <p className="font-display text-sm font-semibold sm:text-base">
            Ready when you are
          </p>
          <div className="flex gap-3">
            <Link
              to="/"
              className="brand-gradient rounded-xl px-6 py-2.5 font-display text-sm font-semibold text-ink"
            >
              Browse games
            </Link>
            <Link
              to="/contact"
              className="rounded-xl border border-cyan/30 bg-cyan/10 px-6 py-2.5 font-display text-sm font-semibold text-cyan"
            >
              Contact us
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
