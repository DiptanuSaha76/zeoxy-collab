import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Aurora } from "@/components/Aurora";
import { supabase } from "@/integrations/supabase/client";


const ACCOUNT_DOMAIN = "moobit.app";

const searchSchema = z.object({ redirect: z.string().optional() });

const signUpSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, { message: "Username must be at least 3 characters" })
    .max(24, { message: "Username must be at most 24 characters" })
    .regex(/^[a-zA-Z0-9_]+$/, { message: "Username can use letters, numbers and _ only" }),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9]{7,15}$/, { message: "Enter a valid phone number (digits only)" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }).max(72),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — Recharge" },
      { name: "description", content: "Sign in to buy game top-ups and track your orders." },
      { property: "og:title", content: "Sign in — Recharge" },
      { property: "og:description", content: "Sign in to buy game top-ups and track your orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const target = search.redirect && search.redirect.startsWith("/") ? search.redirect : "/";

  function goNext() {
    navigate({ to: target, replace: true });
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: target, replace: true });
    });
  }, [navigate, target]);

  async function resolveEmail(value: string): Promise<string> {
    const v = value.trim();
    if (v.includes("@")) return v.toLowerCase();
    const { data } = await supabase.rpc("login_email", { _identifier: v });
    if (typeof data === "string" && data) return data;
    return `${v.toLowerCase()}@${ACCOUNT_DOMAIN}`;
  }

  async function signIn() {
    if (!identifier.trim() || !password) {
      toast.error("Enter your username or number and password");
      return;
    }

    setBusy(true);

    // TEMPORARY ADMIN LOGIN
    if (
      identifier.trim().toLowerCase() === "admin" &&
      password === "ZeoxyAdmin123!"
    ) {
      const { error } = await supabase.auth.signInWithPassword({
        email: "diptanusaha54@gmail.com",
        password: "devbhai7601@",
      });

      setBusy(false);

      if (error) {
        console.error(error);
        toast.error("Admin login failed");
        return;
      }

      goNext();
      return;
    }

    // Existing login
    const email = await resolveEmail(identifier);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setBusy(false);

    if (error) {
      toast.error("Wrong username / number or password");
      return;
    }

    await supabase.rpc("ensure_profile");
    goNext();
  }

  async function signUp() {
    const parsed = signUpSchema.safeParse({ username, phone, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    setBusy(true);
    const handle = parsed.data.username.toLowerCase();
    const { error } = await supabase.auth.signUp({
      email: `${handle}@${ACCOUNT_DOMAIN}`,
      password: parsed.data.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          username: handle,
          display_name: parsed.data.username,
          phone: parsed.data.phone,
        },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(
        error.message.toLowerCase().includes("already")
          ? "That username is already taken"
          : error.message,
      );
      return;
    }
    await supabase.rpc("ensure_profile");
    toast.success("Account created — you're signed in");
    goNext();
  }


  const field =
    "glass-panel w-full rounded-2xl px-3.5 py-3 text-sm outline-none placeholder:text-faint focus:border-violet/50";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10 font-body">
      <Aurora />
      <div className="glass-panel relative z-10 w-full max-w-sm rounded-3xl p-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="brand-gradient grid size-9 place-items-center rounded-xl font-display font-bold text-ink">
            R
          </div>
          <div>
            <p className="font-display text-base font-semibold leading-none">Recharge</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-faint">
              Instant Top-Up
            </p>
          </div>
        </Link>

        <div className="mt-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-semibold">
              {mode === "signin" ? "Welcome back" : "Create account"}
            </h1>
            <p className="mt-1 text-xs text-faint">
              {mode === "signin"
                ? "Log in with your username or number."
                : "Register with a username and phone number."}
            </p>
          </div>
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="glass-panel shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium"
          >
            {mode === "signin" ? "Register" : "Log in"}
          </button>
        </div>

        {mode === "signin" ? (
          <div className="mt-5 space-y-2.5">
            <input
              value={identifier}
              autoComplete="username"
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Username or phone number"
              className={field}
            />
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className={field}
            />
          </div>
        ) : (
          <div className="mt-5 space-y-2.5">
            <input
              value={username}
              autoComplete="username"
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className={field}
            />
            <input
              inputMode="numeric"
              value={phone}
              autoComplete="tel"
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 15))}
              placeholder="Phone number"
              className={field}
            />
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className={field}
            />
            <p className="px-1 text-[10px] leading-relaxed text-faint">
              Number verification by OTP will be added later.
            </p>
          </div>
        )}

        <button
          onClick={mode === "signin" ? signIn : signUp}
          disabled={busy}
          className="brand-gradient mt-3 w-full rounded-2xl py-3.5 font-display text-sm font-semibold text-ink disabled:opacity-50"
        >
          {mode === "signin" ? "Log in" : "Create account"}
        </button>
      </div>
    </div>
  );
}
