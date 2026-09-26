import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { submitContactMessage } from "@/lib/contact.functions";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Us — Zeoxy TopUp Store" },
      {
        name: "description",
        content:
          "Order support, payment questions or bulk enquiries — we're on it, day or night. Chat with us on WhatsApp.",
      },
    ],
  }),
  component: Contact,
});

const CHANNELS = [
  {
    title: "Order support",
    sub: "Delivery in progress, stuck top-up",
    phone: "+91 87681 96610",
    wa: "https://wa.me/918768196610",
  },
  {
    title: "Payments & resellers",
    sub: "Failed payments, wholesale accounts",
    phone: "+91 87681 96610",
    wa: "https://wa.me/918768196610",
  },
];

function Contact() {
  const submitFn = useServerFn(submitContactMessage);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;

    const currentForm = e.currentTarget;
    const form = new FormData(currentForm);

    setBusy(true);

    try {
      await submitFn({
        data: {
          name: String(form.get("name") ?? ""),
          email: String(form.get("email") ?? ""),
          orderNumber: String(form.get("order") ?? ""),
          message: String(form.get("message") ?? ""),
        },
      });

      currentForm.reset();
      setSent(true);
      toast.success("Message sent");
    } catch (error) {
      console.error("[Contact] Submit error:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not send your message",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <nav className="mt-5 flex items-center justify-between px-4 sm:px-6">
        <h1 className="font-display text-base font-semibold sm:text-xl">
          Contact us
        </h1>
        <span className="rounded-full border border-cyan/30 bg-cyan/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] text-cyan">
          24/7
        </span>
      </nav>

      <section className="mt-4 px-4 sm:px-6">
        <div className="brand-gradient rounded-3xl p-6 sm:p-8">
          <h2 className="font-display text-xl font-bold text-ink sm:text-2xl">
            We reply in under 5 minutes
          </h2>
          <p className="mt-1 text-sm text-ink/75">
            Order issues, payment questions or bulk enquiry — we're on it,
            day or night.
          </p>
        </div>
      </section>

      <section className="mt-6 px-4 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {CHANNELS.map((c, i) => (
            <div key={c.title} className="glass-panel rounded-2xl p-4">
              <span className="font-display text-2xl font-bold text-violet/50">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 font-display text-sm font-semibold">
                {c.title}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-faint">
                {c.sub}
              </p>
              <p className="mt-3 text-sm font-medium text-cyan">{c.phone}</p>
              <a
                href={c.wa}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block rounded-xl border border-cyan/30 bg-cyan/10 px-4 py-2.5 text-center font-display text-sm font-semibold text-cyan"
              >
                Chat on WhatsApp
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 px-4 sm:px-6">
        <div className="glass-panel rounded-2xl p-5">
          <h3 className="font-display text-sm font-semibold">
            Send us a message
          </h3>
          <p className="mt-1 text-[11px] text-faint">
            Prefer writing? Fill this in and our team will get back to you.
          </p>

          {sent ? (
            <div className="mt-4 space-y-3">
              <p className="rounded-xl border border-cyan/30 bg-cyan/10 px-4 py-3 text-sm text-cyan">
                Thanks — your message has been sent to our support team.
              </p>
              <button
                type="button"
                onClick={() => setSent(false)}
                className="glass-panel rounded-xl px-4 py-2.5 text-xs font-medium"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form className="mt-4 space-y-3" onSubmit={onSubmit}>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  required
                  maxLength={80}
                  name="name"
                  placeholder="Your name"
                  className="rounded-xl border border-faint/20 bg-muted px-3.5 py-2.5 text-sm outline-none focus:border-cyan/50"
                />
                <input
                  required
                  type="email"
                  maxLength={254}
                  name="email"
                  placeholder="Email address"
                  className="rounded-xl border border-faint/20 bg-muted px-3.5 py-2.5 text-sm outline-none focus:border-cyan/50"
                />
              </div>
              <input
                name="order"
                maxLength={80}
                placeholder="Order number (optional)"
                className="w-full rounded-xl border border-faint/20 bg-muted px-3.5 py-2.5 text-sm outline-none focus:border-cyan/50"
              />
              <textarea
                required
                name="message"
                maxLength={4000}
                rows={4}
                placeholder="How can we help?"
                className="w-full resize-none rounded-xl border border-faint/20 bg-muted px-3.5 py-2.5 text-sm outline-none focus:border-cyan/50"
              />
              <button
                type="submit"
                disabled={busy}
                className="brand-gradient w-full rounded-xl px-6 py-2.5 font-display text-sm font-semibold text-ink disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send message"}
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="mt-6 px-4 pb-6 sm:px-6">
        <div className="rounded-2xl border border-rose/30 bg-rose/10 p-5">
          <h3 className="font-display text-sm font-semibold text-rose">
            ⚠ Only the two numbers above are ours
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-faint">
            We will never message you first asking for payment, and we will
            never ask for your password, an OTP, or a transfer to a personal
            account. Every payment happens on this site, at checkout. If
            someone claims to be us from any other number, they are not — stop
            and report it to the numbers above.
          </p>
        </div>
      </section>
    </PageShell>
  );
}
