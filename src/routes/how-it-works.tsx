import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How It Works — Recharge" },
      {
        name: "description",
        content:
          "Top up in four simple steps: pick your game, enter your player ID, choose a pack, pay and get your top-up instantly.",
      },
    ],
  }),
  component: HowItWorks,
});

const STEPS = [
  {
    n: "01",
    title: "Pick your game",
    body: "Search or browse the catalogue, then open the game's page to see all available packs with live pricing in your currency.",
  },
  {
    n: "02",
    title: "Enter your player ID",
    body: "Type the player ID exactly as it appears in-game. We verify the account name before you pay, so your top-up always lands on the right account.",
  },
  {
    n: "03",
    title: "Choose a pack & pay",
    body: "Pick the pack you want, then pay via UPI, cards, wallets or crypto at checkout. You'll see the final total before you confirm — no hidden fees.",
  },
  {
    n: "04",
    title: "Get your top-up",
    body: "Recharge credits are delivered to your account, usually within ~60 seconds. If the order is delayed or fails, contact us and we'll fix or refund it.",
  },
];

const FAQS = [
  {
    q: "Do I need an account to place an order?",
    a: "No. You can check out as a guest. Creating an account simply lets you track order history and reuse saved player IDs.",
  },
  {
    q: "Is it safe to give you my player ID?",
    a: "Yes. A player ID only identifies your account — it never grants access. We never ask for your password, OTP, or any login credentials.",
  },
  {
    q: "How long does delivery usually take?",
    a: "Most orders complete in under 60 seconds. During rare publisher-side maintenance it can take longer — you'll always see status on your order.",
  },
  {
    q: "I entered the wrong player ID. Can you reverse it?",
    a: "If the order hasn't been delivered yet we can correct or cancel it. Contact support immediately with your order number.",
  },
  {
    q: "Why is the price different from what I see in-game?",
    a: "Prices reflect local taxes, payment processing, and regional publisher rates — and are often lower than buying in-game directly.",
  },
  {
    q: "Can I buy a pack for a different region or server?",
    a: "Yes, as long as the pack is listed for that game. Double-check the server/region shown on the product page before paying.",
  },
  {
    q: "Can I get a refund?",
    a: "Undelivered orders are always refunded in full. Delivered orders can't be reversed, so please confirm your player ID carefully.",
  },
];

function HowItWorks() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <PageShell>
      <nav className="mt-5 flex items-center justify-between px-4 sm:px-6">
        <h1 className="font-display text-base font-semibold sm:text-xl">How it works</h1>
      </nav>

      <section className="mt-4 px-4 sm:px-6">
        <div className="brand-gradient rounded-3xl p-6 sm:p-8">
          <h2 className="font-display text-xl font-bold text-ink sm:text-2xl">
            From checkout to credited — in about a minute
          </h2>
          <p className="mt-1 max-w-xl text-sm text-ink/75">
            No account needed, no waiting around. Here's exactly what happens
            when you place an order with us.
          </p>
        </div>
      </section>

      <section className="mt-6 px-4 sm:px-6">
        <h2 className="mb-3 font-display text-sm font-medium text-subtle sm:text-base">
          Four steps, start to finish
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="glass-panel rounded-2xl p-4">
              <span className="font-display text-2xl font-bold text-violet/50">{s.n}</span>
              <h3 className="mt-2 font-display text-sm font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-faint">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 px-4 sm:px-6">
        <h2 className="mb-3 font-display text-sm font-medium text-subtle sm:text-base">
          Frequently asked questions
        </h2>
        <div className="glass-panel divide-y divide-faint/20 rounded-2xl">
          {FAQS.map((f, i) => (
            <div key={f.q}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left"
              >
                <span className="text-sm font-medium">{f.q}</span>
                <span
                  className={`text-cyan transition-transform ${open === i ? "rotate-45" : ""}`}
                  aria-hidden
                >
                  +
                </span>
              </button>
              {open === i ? (
                <p className="px-4 pb-4 text-xs leading-relaxed text-faint">{f.a}</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 px-4 pb-6 sm:px-6">
        <div className="glass-panel flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <p className="font-display text-sm font-semibold sm:text-base">
            Ready to top up?
          </p>
          <p className="text-xs text-faint">
            Instant delivery · Secured payments
          </p>
          <Link
            to="/"
            className="brand-gradient rounded-xl px-6 py-2.5 font-display text-sm font-semibold text-ink"
          >
            Browse games
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
