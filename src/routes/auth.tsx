import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Aurora } from "@/components/Aurora";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_COUNTRY,
  IDENTIFIER_TYPES,
  OTP_LENGTH,
  PASSWORD_GUIDELINE,
  USERNAME_GUIDELINE,
  USERNAME_MAX,
  emailSchema,
  getCountryOptions,
  normalizeMobile,
  passwordProblem,
  usernameSchema,
  type CountryOption,
  type IdentifierType,
} from "@/lib/auth-rules";
import {
  checkUsername,
  getAccountStatus,
  resendRegistrationOtp,
  resolveLoginEmail,
  setAccountEmail,
  startRegistration,
  verifyRegistration,
} from "@/lib/auth.functions";

const searchSchema = z.object({ redirect: z.string().optional() });

const LOGIN_FAILED = "Wrong username, email, mobile number or password";
const GENERIC_ERROR = "Something went wrong. Please try again.";

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Create your account — Zeoxy TopUp Store" },
      {
        name: "description",
        content: "Register or log in to buy game top-ups and track your orders.",
      },
      { property: "og:title", content: "Create your account — Zeoxy TopUp Store" },
      {
        property: "og:description",
        content: "Register or log in to buy game top-ups and track your orders.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

type Step = "signup" | "signin" | "otp" | "addEmail";
type Field = "username" | "email" | "phone" | "password" | "otp" | "identifier" | "name";
type Errors = Partial<Record<Field, string>>;
type Pending = { registrationId: string; maskedPhone: string };
type UsernameState = {
  status: "idle" | "checking" | "available" | "taken" | "invalid" | "unknown";
  message: string;
};

const IDLE_USERNAME: UsernameState = { status: "idle", message: "" };

function FieldError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="px-1 text-[11px] leading-relaxed text-rose-300">
      {message}
    </p>
  );
}

function CountryCodeSelect({
  countries,
  country,
  onChange,
}: {
  countries: CountryOption[];
  country: string;
  onChange: (iso: string) => void;
}) {
  const selected = countries.find((c) => c.iso === country);

  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const options = ready ? countries : countries.filter((c) => c.iso === country);

  return (
    <div className="glass-panel relative flex shrink-0 items-center gap-1.5 rounded-2xl px-3 text-sm focus-within:border-violet/50">
      <span aria-hidden="true">{selected ? `${selected.flag} ${selected.dial}` : "Code"}</span>
      <span aria-hidden="true" className="text-[10px] text-faint">
        ▼
      </span>
      <select
        value={country}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Country code"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {options.map((c) => (
          <option key={c.iso} value={c.iso}>
            {c.flag} {c.name} ({c.dial})
          </option>
        ))}
      </select>
    </div>
  );
}

function useCountdown(): [number, (seconds: number) => void] {
  const [endsAt, setEndsAt] = useState(0);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  return [left, (seconds: number) => setEndsAt(Date.now() + seconds * 1000)];
}

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [step, setStep] = useState<Step>("signup");
  const [identifierType, setIdentifierType] = useState<IdentifierType>("username");
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState<string>(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [usernameState, setUsernameState] = useState<UsernameState>(IDLE_USERNAME);
  const [resendIn, startResendTimer] = useCountdown();
  const [busy, setBusy] = useState(false);

  const resolveLoginEmailFn = useServerFn(resolveLoginEmail);
  const getAccountStatusFn = useServerFn(getAccountStatus);
  const setAccountEmailFn = useServerFn(setAccountEmail);
  const startRegistrationFn = useServerFn(startRegistration);
  const resendFn = useServerFn(resendRegistrationOtp);
  const verifyFn = useServerFn(verifyRegistration);
  const checkUsernameFn = useServerFn(checkUsername);

  const checkUsernameRef = useRef(checkUsernameFn);
  checkUsernameRef.current = checkUsernameFn;
  const checkSeq = useRef(0);

  const countries = getCountryOptions();
  const target = search.redirect && search.redirect.startsWith("/") ? search.redirect : "/";

  function goNext() {
    navigate({ to: target, replace: true });
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: target, replace: true });
    });
  }, [navigate, target]);

  useEffect(() => {
    if (step !== "signup") return;
    const value = username.trim();
    if (!value) {
      setUsernameState(IDLE_USERNAME);
      return;
    }
    const local = usernameSchema.safeParse(value);
    if (!local.success) {
      setUsernameState({ status: "invalid", message: local.error.issues[0]!.message });
      return;
    }
    setUsernameState({ status: "checking", message: "Checking availability…" });
    const seq = ++checkSeq.current;
    const timer = setTimeout(() => {
      checkUsernameRef
        .current({ data: { username: local.data } })
        .then((res) => {
          if (seq !== checkSeq.current) return;
          setUsernameState({ status: res.status, message: res.message });
        })
        .catch(() => {
          if (seq === checkSeq.current) setUsernameState({ status: "unknown", message: "" });
        });
    }, 450);
    return () => clearTimeout(timer);
  }, [username, step]);

  function clearError(field: Field) {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function oneError(field: Field | undefined, message: string, fallback: Field): Errors {
    return { [field ?? fallback]: message } as Errors;
  }

  function showErrors(next: Errors) {
    setErrors(next);
    const first = (["username", "email", "phone", "password", "identifier", "otp"] as Field[])
      .map((f) => next[f])
      .find(Boolean);
    if (first) toast.error(first);
  }

  function goToStep(next: Step) {
    setStep(next);
    setErrors({});
    setPassword("");
    setOtp("");
    if (next !== "otp") setPending(null);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      console.error(err);
      toast.error(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }

  const sendCode = () =>
    run(async () => {
      const next: Errors = {};
      const u = usernameSchema.safeParse(username);
      if (!u.success) next.username = u.error.issues[0]!.message;
      else if (usernameState.status === "taken") next.username = usernameState.message;
      const e = emailSchema.safeParse(email);
      if (!e.success) next.email = e.error.issues[0]!.message;
      const mobile = normalizeMobile(country, phone);
      if (!mobile.ok) next.phone = mobile.message;
      const badPassword = passwordProblem(password, {
        ...(u.success ? { username: u.data } : {}),
        ...(e.success ? { email: e.data } : {}),
      });
      if (badPassword) next.password = badPassword;

      if (Object.values(next).some(Boolean)) {
        showErrors(next);
        return;
      }

      const res = await startRegistrationFn({
        data: { username, email, phoneCountry: country, phoneNumber: phone, password },
      });
      if (!res.ok) {
        showErrors(oneError(res.field, res.message, "username"));
        if (res.field === "username") setUsernameState({ status: "taken", message: res.message });
        return;
      }
      setErrors({});
      setPending({ registrationId: res.registrationId, maskedPhone: res.maskedPhone });
      setOtp("");
      startResendTimer(res.resendIn);
      setStep("otp");
      toast.success(`Code sent to ${res.maskedPhone}`);
    });

  const resend = () =>
    run(async () => {
      if (!pending) return;
      const res = await resendFn({ data: { registrationId: pending.registrationId } });
      if (!res.ok) {
        toast.error(res.message);
        if (res.code === "NOT_FOUND") goToStep("signup");
        return;
      }
      setOtp("");
      setErrors({});
      startResendTimer(res.resendIn);
      toast.success(`New code sent to ${res.maskedPhone}`);
    });

  const verify = () =>
    run(async () => {
      if (!pending) return;
      if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(otp)) {
        showErrors({ otp: `Enter the ${OTP_LENGTH}-digit code` });
        return;
      }
      const res = await verifyFn({
        data: { registrationId: pending.registrationId, otp, password },
      });
      if (!res.ok) {
        showErrors(oneError(res.field, res.message, "otp"));
        if (res.code === "OTP_EXPIRED" || res.code === "OTP_ATTEMPTS") setOtp("");
        if (res.code === "NOT_FOUND" || res.code === "TAKEN") {
          setPending(null);
          setStep("signup");
        }
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email: res.email, password });
      const createdUsername = username;
      setPassword("");
      setPending(null);
      setErrors({});
      if (error) {
        toast.success("Account created — please log in");
        setIdentifierType("username");
        setIdentifier(createdUsername);
        setStep("signin");
        return;
      }
      await supabase.rpc("ensure_profile");
      toast.success("Account created — you're signed in");
      goNext();
    });

  const signIn = () =>
    run(async () => {
      const next: Errors = {};
      if (!password) next.password = "Enter your password";

      let loginEmail: string | null = null;
      if (identifierType === "email") {
        const parsed = emailSchema.safeParse(identifier);
        if (!parsed.success) next.identifier = "Enter your email address";
        else loginEmail = parsed.data;
      } else if (identifierType === "username") {
        if (!identifier.trim()) next.identifier = "Enter your username";
      } else {
        const mobile = normalizeMobile(country, phone);
        if (!mobile.ok) next.phone = mobile.message;
      }
      if (Object.values(next).some(Boolean)) {
        showErrors(next);
        return;
      }
      setErrors({});

      if (!loginEmail) {
        const res = await resolveLoginEmailFn({
          data: {
            identifierType,
            identifier: identifierType === "username" ? identifier : undefined,
            phoneCountry: identifierType === "phone" ? country : undefined,
            phoneNumber: identifierType === "phone" ? phone : undefined,
            password,
          },
        });
        if (!res.ok) {
          showErrors(oneError(res.field, res.message, "password"));
          return;
        }
        loginEmail = res.email;
      }

      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (error) {
        const message =
          error.status === 429
            ? "Too many login attempts. Please wait a few minutes."
            : LOGIN_FAILED;
        showErrors({ password: message });
        return;
      }
      setPassword("");
      await supabase.rpc("ensure_profile");

      const status = await getAccountStatusFn().catch(() => ({ needsEmail: false }));
      if (status.needsEmail) {
        goToStep("addEmail");
        return;
      }
      goNext();
    });

  const saveEmail = () =>
    run(async () => {
      const parsed = emailSchema.safeParse(newEmail);
      if (!parsed.success) {
        showErrors({ email: parsed.error.issues[0]!.message });
        return;
      }
      const res = await setAccountEmailFn({ data: { email: parsed.data } });
      if (!res.ok) {
        showErrors({ email: res.message });
        if (res.code === "NOT_NEEDED") goNext();
        return;
      }
      setErrors({});
      await supabase.auth.refreshSession();
      toast.success("Email saved — you can now log in with it too");
      goNext();
    });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (step === "signup") void sendCode();
    else if (step === "signin") void signIn();
    else if (step === "otp") void verify();
    else void saveEmail();
  }

  const field =
    "glass-panel w-full rounded-2xl px-3.5 py-3 text-sm outline-none placeholder:text-faint focus:border-violet/50";
  const bad = "border-rose-400/60 focus:border-rose-400/80";
  const inputClass = (f: Field, extra = "") => `${field} ${errors[f] ? bad : ""} ${extra}`.trim();
  const hint = "px-1 text-[10px] leading-relaxed text-faint";

  const usernameTone =
    usernameState.status === "taken" || usernameState.status === "invalid"
      ? "text-rose-300"
      : usernameState.status === "available"
        ? "text-emerald-300"
        : "text-faint";

  const pickCountry = (iso: string) => {
    setCountry(iso);
    clearError("phone");
  };

  const heading: Record<Step, [string, string]> = {
    signup: ["Create account", "Register with your username, email and mobile number."],
    signin: ["Welcome back", "Log in with your username, email or mobile number."],
    otp: [
      "Verify your mobile",
      `Enter the ${OTP_LENGTH}-digit code sent to ${pending?.maskedPhone ?? "your mobile"}.`,
    ],
    addEmail: [
      "Add your email",
      "Your account was created before email sign-in. Add your email to log in with it too.",
    ],
  };

  const submitLabel: Record<Step, [string, string]> = {
    signup: ["Send verification code", "Sending code…"],
    signin: ["Log in", "Logging in…"],
    otp: ["Verify & create account", "Verifying…"],
    addEmail: ["Save email", "Saving…"],
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10 font-body">
      <Aurora />
      <div className="glass-panel relative z-10 w-full max-w-sm rounded-3xl p-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="size-9 shrink-0 overflow-hidden rounded-xl">
            <img
              src="/logo.jpeg"
              alt="Zeoxy"
              className="h-full w-full object-contain"
            />
          </div>
          <div>
            <p className="font-display text-base font-semibold leading-none">Zeoxy TopUp Store</p>
          </div>
        </Link>

        <div className="mt-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-semibold">{heading[step][0]}</h1>
            <p className="mt-1 text-xs text-faint">{heading[step][1]}</p>
          </div>
          {step === "signup" || step === "signin" ? (
            <button
              type="button"
              onClick={() => goToStep(step === "signup" ? "signin" : "signup")}
              disabled={busy}
              className="glass-panel shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium"
            >
              {step === "signup" ? "Log in" : "Register"}
            </button>
          ) : null}
        </div>

        <form onSubmit={onSubmit} noValidate>
          {step === "signup" ? (
            <div className="mt-5 space-y-2.5">
              <div className="space-y-1">
                <input
                  value={username}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  aria-required="true"
                  maxLength={USERNAME_MAX}
                  onChange={(e) => {
                    setUsername(e.target.value.replace(/\s+/g, ""));
                    clearError("username");
                  }}
                  placeholder="Username"
                  aria-label="Username"
                  className={inputClass("username")}
                />
                <p className={`${hint} ${usernameState.message ? usernameTone : ""}`}>
                  {usernameState.message || USERNAME_GUIDELINE}
                </p>
                <FieldError message={errors.username} />
              </div>

              <div className="space-y-1">
                <input
                  type="email"
                  inputMode="email"
                  value={email}
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  aria-required="true"
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError("email");
                  }}
                  placeholder="Email address"
                  aria-label="Email address"
                  className={inputClass("email")}
                />
                <FieldError message={errors.email} />
              </div>

              <div className="space-y-1">
                <div className="flex gap-2">
                  <CountryCodeSelect
                    countries={countries}
                    country={country}
                    onChange={pickCountry}
                  />
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    autoComplete="tel-national"
                    required
                    aria-required="true"
                    onChange={(e) => {
                      setPhone(e.target.value.replace(/[^\d\s-]/g, "").slice(0, 18));
                      clearError("phone");
                    }}
                    placeholder="Mobile number"
                    aria-label="Mobile number"
                    className={inputClass("phone", "min-w-0")}
                  />
                </div>
                <FieldError message={errors.phone} />
              </div>

              <div className="space-y-1">
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  required
                  aria-required="true"
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearError("password");
                  }}
                  placeholder="Password"
                  aria-label="Password"
                  className={inputClass("password")}
                />
                <FieldError message={errors.password} />
              </div>

              <p className={hint}>
                {PASSWORD_GUIDELINE} All fields are required — we'll text a verification code to
                your mobile.
              </p>
            </div>
          ) : null}

          {step === "signin" ? (
            <div className="mt-5 space-y-2.5">
              <div
                role="radiogroup"
                aria-label="Log in with"
                className="glass-panel flex gap-1 rounded-2xl p-1"
              >
                {IDENTIFIER_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={identifierType === t.value}
                    onClick={() => {
                      setIdentifierType(t.value);
                      setErrors({});
                    }}
                    className={`flex-1 rounded-xl px-2 py-1.5 text-[11px] font-medium transition ${identifierType === t.value
                        ? "brand-gradient text-ink"
                        : "text-faint hover:text-current"
                      }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {identifierType === "phone" ? (
                <div className="space-y-1">
                  <div className="flex gap-2">
                    <CountryCodeSelect
                      countries={countries}
                      country={country}
                      onChange={pickCountry}
                    />
                    <input
                      type="tel"
                      inputMode="tel"
                      value={phone}
                      autoComplete="tel-national"
                      required
                      aria-required="true"
                      onChange={(e) => {
                        setPhone(e.target.value.replace(/[^\d\s-]/g, "").slice(0, 18));
                        clearError("phone");
                      }}
                      placeholder="Mobile number"
                      aria-label="Mobile number"
                      className={inputClass("phone", "min-w-0")}
                    />
                  </div>
                  <FieldError message={errors.phone} />
                </div>
              ) : (
                <div className="space-y-1">
                  <input
                    key={identifierType}
                    value={identifier}
                    type={identifierType === "email" ? "email" : "text"}
                    inputMode={identifierType === "email" ? "email" : "text"}
                    autoComplete={identifierType === "email" ? "email" : "username"}
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    aria-required="true"
                    onChange={(e) => {
                      setIdentifier(e.target.value);
                      clearError("identifier");
                    }}
                    placeholder={identifierType === "email" ? "Email address" : "Username"}
                    aria-label={identifierType === "email" ? "Email address" : "Username"}
                    className={inputClass("identifier")}
                  />
                  <FieldError message={errors.identifier} />
                </div>
              )}

              <div className="space-y-1">
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  required
                  aria-required="true"
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearError("password");
                  }}
                  placeholder="Password"
                  aria-label="Password"
                  className={inputClass("password")}
                />
                <FieldError message={errors.password} />
              </div>
            </div>
          ) : null}

          {step === "otp" ? (
            <div className="mt-5 space-y-2.5">
              <input
                value={otp}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={OTP_LENGTH}
                onChange={(e) => {
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH));
                  clearError("otp");
                }}
                placeholder={"•".repeat(OTP_LENGTH)}
                aria-label="Verification code"
                className={inputClass("otp", "text-center font-display text-lg tracking-[0.5em]")}
              />
              <FieldError message={errors.otp} />
              <div className="flex items-center justify-between gap-3 px-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => void resend()}
                  disabled={busy || resendIn > 0}
                  className="font-medium underline-offset-2 hover:underline disabled:text-faint disabled:no-underline"
                >
                  {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPending(null);
                    setOtp("");
                    setErrors({});
                    setStep("signup");
                  }}
                  disabled={busy}
                  className="text-faint underline-offset-2 hover:underline"
                >
                  Change details
                </button>
              </div>
            </div>
          ) : null}

          {step === "addEmail" ? (
            <div className="mt-5 space-y-1">
              <input
                type="email"
                inputMode="email"
                value={newEmail}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  clearError("email");
                }}
                placeholder="Email address"
                aria-label="Email address"
                className={inputClass("email")}
              />
              <FieldError message={errors.email} />
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="brand-gradient mt-3 w-full rounded-2xl py-3.5 font-display text-sm font-semibold text-ink disabled:opacity-50"
          >
            {busy ? submitLabel[step][1] : submitLabel[step][0]}
          </button>

          {step === "addEmail" ? (
            <button
              type="button"
              onClick={goNext}
              disabled={busy}
              className="mt-2 w-full py-2 text-[11px] text-faint underline-offset-2 hover:underline"
            >
              Skip for now
            </button>
          ) : null}
        </form>
      </div>
    </div>
  );
}
