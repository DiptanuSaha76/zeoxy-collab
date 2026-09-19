import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Zap,
  ShieldCheck,
  CreditCard,
  BadgeCheck,
  Headset,
  Star,
  BadgeCheck as VerifiedIcon,
  Send,
  Instagram,
  Twitter,
  MessageCircle,
} from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { bannersQuery, gamesQuery } from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Recharge — Instant Game Top-Up Store" },
      {
        name: "description",
        content:
          "Top up gems, chips and crystals for your favourite games. Instant delivery, secure payments.",
      },
      { property: "og:title", content: "Recharge — Instant Game Top-Up Store" },
      {
        property: "og:description",
        content: "Top up gems, chips and crystals for your favourite games in seconds.",
      },
    ],
  }),
  component: Home,
});

const FEATURES = [
  { icon: Zap, title: "Fast delivery", text: "Recharges are completed in under five minutes." },
  { icon: ShieldCheck, title: "Secure checkout", text: "Encrypted payments, no card details stored." },
  { icon: CreditCard, title: "Payment choice", text: "UPI, cards, net banking, wallets and crypto." },
  { icon: BadgeCheck, title: "Verified products", text: "Sourced from authorized regional resellers." },
  { icon: Headset, title: "Support that answers", text: "Live help from 9am to 2am, every day." },
];

const REVIEWS = [
  {
    name: "Aditya Menon",
    initials: "AM",
    date: "12 Sep 2026",
    verified: true,
    stars: 5,
    text: "Ordered the weekly pass at 2am and it landed before I closed the app. Pricing better than the in-game store.",
  },
  {
    name: "Sneha Raut",
    initials: "SR",
    date: "08 Sep 2026",
    verified: true,
    stars: 5,
    text: "Third order this month. The ID check step saved me from sending diamonds to the wrong zone.",
  },
  {
    name: "Kabir Shah",
    initials: "KS",
    date: "01 Sep 2026",
    verified: true,
    stars: 5,
    text: "Delivery took about six minutes during peak hours, still quick. UPI checkout was painless.",
  },
  {
    name: "Meera Iyer",
    initials: "MI",
    date: "27 Aug 2026",
    verified: false,
    stars: 5,
    text: "Support replied on Telegram in a couple of minutes when I mistyped my user ID. Sorted it immediately.",
  },
];

function Home() {
  const { data: banners = [] } = useQuery(bannersQuery());
  const { data: games = [] } = useQuery(gamesQuery());

  const [slide, setSlide] = useState(0);
  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % banners.length), 5000);
    return () => clearInterval(t);
  }, [banners.length]);

  const active = banners.length ? banners[slide % banners.length] : undefined;
  const bannerGame = games.find((g) => g.id === active?.game_id);

  return (
    <PageShell>
      <nav className="mt-5 flex items-center justify-between px-4 sm:px-6">
        <h1 className="font-display text-base font-semibold sm:text-xl">Instant game top-ups</h1>
        <span className="rounded-full border border-cyan/30 bg-cyan/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] text-cyan">
          Live
        </span>
      </nav>

      <section className="mt-4 px-4 sm:px-6">
        <div className="glass-panel overflow-hidden rounded-3xl p-2">
          <div
            role="button"
            tabIndex={0}
            aria-label="Tap right for next banner, left for previous"
            onClick={(e) => {
              if (banners.length < 2) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const next = e.clientX - rect.left > rect.width / 2;
              setSlide((s) => (s + (next ? 1 : banners.length - 1)) % banners.length);
            }}
            onKeyDown={(e) => {
              if (banners.length < 2) return;
              if (e.key === "ArrowRight") setSlide((s) => (s + 1) % banners.length);
              if (e.key === "ArrowLeft") setSlide((s) => (s + banners.length - 1) % banners.length);
            }}
            className="relative aspect-[16/10] cursor-pointer select-none overflow-hidden rounded-2xl bg-muted sm:aspect-[21/8]"
          >
            {active?.image_url ? (
              <img
                src={active.image_url}
                alt={active.title}
                width={1600}
                height={640}
                className="absolute inset-0 size-full object-cover"
              />
            ) : null}
            {active?.badge ? (
              <div className="absolute left-3 top-3 rounded-full bg-rose/90 px-2.5 py-1 text-[10px] font-semibold text-ink">
                {active.badge}
              </div>
            ) : null}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[oklch(0.17_0.048_268/0.9)] to-transparent p-4 pt-12 sm:p-6 sm:pt-20">
              <p className="font-display text-lg font-semibold leading-tight text-[oklch(0.95_0.02_272)] sm:text-2xl">
                {active?.title ?? "Loading"}
              </p>
              <p className="text-xs text-[oklch(0.95_0.02_272/0.65)] sm:text-sm">
                {active?.subtitle ?? ""}
              </p>
              {bannerGame ? (
                <Link
                  to="/topup/$slug"
                  params={{ slug: bannerGame.slug }}
                  onClick={(e) => e.stopPropagation()}
                  className="brand-gradient mt-3 inline-block rounded-xl px-6 py-2.5 text-center font-display text-sm font-semibold text-ink"
                >
                  Top Up
                </Link>
              ) : null}
            </div>
          </div>
        </div>
        {banners.length > 1 ? (
          <div className="mt-3 flex justify-center gap-1.5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                onClick={() => setSlide(i)}
                aria-label={`Show ${b.title}`}
                className={
                  i === slide % banners.length
                    ? "h-1.5 w-6 rounded-full bg-cyan"
                    : "h-1.5 w-1.5 rounded-full bg-faint"
                }
              />
            ))}
          </div>
        ) : null}
      </section>

      <section className="mt-6 px-4 sm:px-6">
        <h2 className="mb-3 font-display text-sm font-medium text-subtle sm:text-base">
          Choose a game
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {games.map((game) => (
            <Link
              key={game.id}
              to="/topup/$slug"
              params={{ slug: game.slug }}
              className="glass-panel rounded-2xl p-3 transition hover:border-violet/50"
            >
              {game.cover_url ? (
                <img
                  src={game.cover_url}
                  alt={game.name}
                  loading="lazy"
                  width={512}
                  height={512}
                  className="aspect-square w-full rounded-xl object-cover"
                />
              ) : (
                <div className="aspect-square w-full rounded-xl bg-muted" />
              )}
              <p className="mt-2.5 font-display text-sm font-medium">{game.name}</p>
              <p className="text-[11px] text-faint">{game.category}</p>
            </Link>
          ))}
        </div>
        {games.length === 0 ? (
          <p className="text-sm text-faint">Games are being added — check back soon.</p>
        ) : null}
        <p className="mt-4 text-center text-[11px] text-faint">
          Instant delivery · Secured payments
        </p>
      </section>

      {/* Features strip */}
      <section className="mt-10 px-4 sm:px-6">
        <div className="glass-panel grid gap-4 rounded-3xl p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex flex-col gap-1.5">
              <f.icon className="size-4 text-violet" />
              <p className="font-display text-xs font-semibold">{f.title}</p>
              <p className="text-[11px] leading-relaxed text-faint">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What gamers say */}
      <section className="mt-10 px-4 sm:px-6">
        <h2 className="font-display text-lg font-semibold sm:text-xl">What gamers say</h2>
        <p className="mt-0.5 text-[11px] text-faint sm:text-xs">Verified reviews from real customers</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {REVIEWS.map((r) => (
            <div key={r.name} className="glass-panel rounded-2xl p-4">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet/20 text-[10px] font-semibold text-violet">
                  {r.initials}
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-1 truncate text-xs font-medium">
                    {r.name}
                    {r.verified ? <VerifiedIcon className="size-3 shrink-0 text-lime" /> : null}
                  </p>
                  <p className="text-[10px] text-faint">{r.date}</p>
                </div>
              </div>
              <div className="mt-2 flex gap-0.5">
                {Array.from({ length: r.stars }).map((_, i) => (
                  <Star key={i} className="size-3 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-subtle">{r.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Ready to top up CTA */}
      <section className="mt-10 px-4 sm:px-6">
        <div className="glass-panel rounded-3xl px-6 py-10 text-center sm:py-14">
          <h2 className="font-display text-xl font-semibold sm:text-2xl">Ready to top up?</h2>
          <p className="mx-auto mt-2 max-w-md text-xs text-faint sm:text-sm">
            Join thousands of players who recharge in minutes. No sign-up required for guest checkout.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#"
              className="brand-gradient rounded-xl px-6 py-2.5 font-display text-sm font-semibold text-ink"
            >
              Shop top-ups
            </a>
            <Link
              to="/how-it-works"
              className="rounded-xl border border-white/10 bg-muted/40 px-6 py-2.5 font-display text-sm font-semibold text-subtle transition hover:border-violet/50"
            >
              How it works
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-14 border-t border-white/5 px-4 pb-8 pt-10 sm:px-6">
        <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-display text-sm font-semibold tracking-wide">TYS GLOBAL</p>
            <p className="mt-2 text-[11px] leading-relaxed text-faint">
              Direct game top-ups and digital vouchers, delivered in minutes at reseller pricing.
            </p>
            <div className="mt-3 flex gap-2">
              {[Send, Instagram, Twitter, MessageCircle].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  aria-label="Social link"
                  className="flex size-7 items-center justify-center rounded-full border border-white/10 text-faint transition hover:border-violet/50 hover:text-violet"
                >
                  <Icon className="size-3" />
                </a>
                              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-faint">Shop</p>
            <ul className="mt-3 space-y-2 text-xs text-subtle">
              <li><a href="#" className="transition hover:text-violet">All Top-ups</a></li>
            </ul>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-faint">Company</p>
            <ul className="mt-3 space-y-2 text-xs text-subtle">
              <li><Link to="/about" className="transition hover:text-violet">About Us</Link></li>
              <li><Link to="/how-it-works" className="transition hover:text-violet">How It Works</Link></li>
              <li><Link to="/contact" className="transition hover:text-violet">Contact</Link></li>
              <li><Link to="/contact" className="transition hover:text-violet">Refunds & Privacy</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-faint">Payments</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["UPI", "Cards", "Wallet", "Net Banking"].map((p) => (
                <span
                  key={p}
                  className="rounded-md border border-white/10 bg-muted/40 px-2.5 py-1 text-[10px] text-subtle"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto mt-10 flex max-w-5xl flex-col items-center justify-between gap-2 border-t border-white/5 pt-5 text-[10px] text-faint sm:flex-row">
          <p>© {new Date().getFullYear()} TYS GLOBAL. All rights reserved.</p>
          <p>Not affiliated with the game publishers listed on this site.</p>
        </div>
      </footer>
    </PageShell>
  );
}





