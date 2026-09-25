import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LogOut, Receipt, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { USERNAME_GUIDELINE, USERNAME_MAX, formatMobile, usernameSchema } from "@/lib/auth-rules";
import { checkUsername, getMyProfile, updateMyProfile } from "@/lib/auth.functions";
import { money } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My profile — Recharge" },
      { name: "description", content: "Your account details, username and order summary." },
      { property: "og:title", content: "My profile — Recharge" },
      { property: "og:description", content: "Your account details, username and order summary." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

type Availability = {
  status: "idle" | "checking" | "available" | "taken" | "invalid" | "unknown";
  message: string;
};

const IDLE: Availability = { status: "idle", message: "" };

function joinedLabel(iso: string) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getProfileFn = useServerFn(getMyProfile);
  const updateProfileFn = useServerFn(updateMyProfile);
  const checkUsernameFn = useServerFn(checkUsername);

  const checkUsernameRef = useRef(checkUsernameFn);
  checkUsernameRef.current = checkUsernameFn;
  const checkSeq = useRef(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => getProfileFn(),
    staleTime: 30_000,
  });

  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [availability, setAvailability] = useState<Availability>(IDLE);
  const [errors, setErrors] = useState<{ username?: string; name?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setUsername(data.username);
    setDisplayName(data.displayName);
  }, [data]);

  useEffect(() => {
    if (!editing || !data) return;
    const value = username.trim();
    if (!value || value.toLowerCase() === data.username.toLowerCase()) {
      setAvailability(IDLE);
      return;
    }
    const local = usernameSchema.safeParse(value);
    if (!local.success) {
      setAvailability({ status: "invalid", message: local.error.issues[0]!.message });
      return;
    }
    setAvailability({ status: "checking", message: "Checking availability…" });
    const seq = ++checkSeq.current;
    const timer = setTimeout(() => {
      checkUsernameRef
        .current({ data: { username: local.data } })
        .then((res) => {
          if (seq === checkSeq.current)
            setAvailability({ status: res.status, message: res.message });
        })
        .catch(() => {
          if (seq === checkSeq.current) setAvailability({ status: "unknown", message: "" });
        });
    }, 450);
    return () => clearTimeout(timer);
  }, [username, editing, data]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function startEditing() {
    if (!data) return;
    setUsername(data.username);
    setDisplayName(data.displayName);
    setErrors({});
    setAvailability(IDLE);
    setEditing(true);
  }

  function cancelEditing() {
    if (data) {
      setUsername(data.username);
      setDisplayName(data.displayName);
    }
    setErrors({});
    setAvailability(IDLE);
    setEditing(false);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    const next: { username?: string; name?: string } = {};
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) next.username = parsed.error.issues[0]!.message;
    else if (availability.status === "taken") next.username = availability.message;
    if (displayName.trim().length < 2) next.name = "Enter a name of at least 2 characters";
    if (next.username || next.name) {
      setErrors(next);
      toast.error(next.username ?? next.name!);
      return;
    }

    setBusy(true);
    try {
      const res = await updateProfileFn({ data: { username, displayName } });
      if (!res.ok) {
        const field = res.field === "name" ? "name" : "username";
        setErrors({ [field]: res.message });
        toast.error(res.message);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      setEditing(false);
      setErrors({});
      toast.success("Profile updated");
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="px-4 py-6 sm:px-6">
        <p className="text-sm text-faint">Loading your profile…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="px-4 py-6 sm:px-6">
        <h1 className="font-display text-2xl font-semibold">My profile</h1>
        <p className="mt-2 text-sm text-faint">
          We couldn't load your profile. Please reload the page.
        </p>
      </div>
    );
  }

  const field =
    "glass-panel w-full rounded-2xl px-3.5 py-3 text-sm outline-none placeholder:text-faint focus:border-violet/50";
  const initial = (data.displayName || data.username || "?").charAt(0).toUpperCase();
  const availabilityTone =
    availability.status === "taken" || availability.status === "invalid"
      ? "text-rose-300"
      : availability.status === "available"
        ? "text-emerald-300"
        : "text-faint";

  return (
    <div className="px-4 py-6 sm:px-6">
      <h1 className="font-display text-2xl font-semibold">My profile</h1>
      <p className="mt-1 text-xs text-faint">Your account details and top-up summary.</p>

      <div className="glass-panel mt-5 rounded-3xl p-5">
        <div className="flex items-center gap-4">
          <div className="brand-gradient grid size-14 shrink-0 place-items-center rounded-2xl font-display text-xl font-bold text-ink">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-semibold">
              {data.displayName || data.username || "Your account"}
            </p>
            {data.username ? <p className="truncate text-xs text-faint">@{data.username}</p> : null}
          </div>
          {data.isAdmin ? (
            <span className="glass-panel ml-auto flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] text-cyan">
              <ShieldCheck className="size-3.5" />
              Admin
            </span>
          ) : null}
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="glass-panel rounded-2xl px-4 py-3">
            <dt className="text-[10px] uppercase tracking-[0.2em] text-faint">Orders</dt>
            <dd className="mt-1 font-display text-lg font-semibold">{data.orderCount}</dd>
          </div>
          <div className="glass-panel rounded-2xl px-4 py-3">
            <dt className="text-[10px] uppercase tracking-[0.2em] text-faint">Completed</dt>
            <dd className="mt-1 font-display text-lg font-semibold">{data.completedCount}</dd>
          </div>
          <div className="glass-panel rounded-2xl px-4 py-3">
            <dt className="text-[10px] uppercase tracking-[0.2em] text-faint">Total spent</dt>
            <dd className="mt-1 font-display text-lg font-semibold">{money(data.spent)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="glass-panel rounded-3xl p-5">
          <h2 className="font-display text-base font-semibold">Account details</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-faint">Email</dt>
              <dd className="min-w-0 truncate text-right">{data.email || "—"}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-faint">Mobile</dt>
              <dd className="text-right">{data.mobile ? formatMobile(data.mobile) : "—"}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-faint">Member since</dt>
              <dd className="text-right">{joinedLabel(data.joinedAt)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-[10px] leading-relaxed text-faint">
            Your email and mobile number are used to sign in, so they can't be changed here. Contact
            support if either one is wrong.
          </p>
        </section>

        <section className="glass-panel rounded-3xl p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-base font-semibold">Edit profile</h2>
            {editing ? null : (
              <button
                type="button"
                onClick={startEditing}
                className="glass-panel shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium"
              >
                Edit
              </button>
            )}
          </div>

          {editing ? (
            <form onSubmit={save} noValidate className="mt-4 space-y-3">
              <div className="space-y-1">
                <label htmlFor="profile-name" className="px-1 text-[11px] text-faint">
                  Display name
                </label>
                <input
                  id="profile-name"
                  value={displayName}
                  maxLength={40}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    setErrors(({ name: _drop, ...rest }) => rest);
                  }}
                  className={`${field} ${errors.name ? "border-rose-400/60" : ""}`}
                />
                {errors.name ? (
                  <p role="alert" className="px-1 text-[11px] text-rose-300">
                    {errors.name}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1">
                <label htmlFor="profile-username" className="px-1 text-[11px] text-faint">
                  Username
                </label>
                <input
                  id="profile-username"
                  value={username}
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={USERNAME_MAX}
                  onChange={(e) => {
                    setUsername(e.target.value.replace(/\s+/g, ""));
                    setErrors(({ username: _drop, ...rest }) => rest);
                  }}
                  className={`${field} ${errors.username ? "border-rose-400/60" : ""}`}
                />
                <p
                  className={`px-1 text-[10px] leading-relaxed ${
                    availability.message ? availabilityTone : "text-faint"
                  }`}
                >
                  {availability.message || USERNAME_GUIDELINE}
                </p>
                {errors.username ? (
                  <p role="alert" className="px-1 text-[11px] text-rose-300">
                    {errors.username}
                  </p>
                ) : null}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={busy}
                  className="brand-gradient flex-1 rounded-2xl py-3 font-display text-sm font-semibold text-ink disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={busy}
                  className="glass-panel rounded-2xl px-4 py-3 text-sm text-subtle"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-faint">Display name</dt>
                <dd className="min-w-0 truncate text-right">{data.displayName || "—"}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-faint">Username</dt>
                <dd className="min-w-0 truncate text-right">{data.username || "—"}</dd>
              </div>
            </dl>
          )}
        </section>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to="/orders"
          className="glass-panel flex items-center gap-2 rounded-2xl px-4 py-3 text-sm text-subtle"
        >
          <Receipt className="size-4" />
          My orders
        </Link>
        {data.isAdmin ? (
          <Link
            to="/admin"
            className="glass-panel flex items-center gap-2 rounded-2xl px-4 py-3 text-sm text-cyan"
          >
            <ShieldCheck className="size-4" />
            Admin panel
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => void signOut()}
          className="glass-panel flex items-center gap-2 rounded-2xl px-4 py-3 text-sm text-subtle"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}
