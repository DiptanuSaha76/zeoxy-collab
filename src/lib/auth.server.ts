import { createHmac, timingSafeEqual } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isDisposableEmailDomain } from "@/lib/disposable-email-domains";

export const OTP_POLICY = {
  ttlSeconds: 5 * 60,
  maxAttempts: 5,
  resendCooldownSeconds: 60,
  maxSendsPerRegistration: 5,
  maxSendsPerPhonePerHour: 5,
  maxSendsPerIpPerHour: 10,
} as const;

export const LOGIN_POLICY = {
  windowSeconds: 15 * 60,
  maxPerIp: 20,
  maxPerIdentifier: 10,

  maxUsernameChecks: 60,
  usernameCheckWindowSeconds: 15 * 60,
} as const;

const ONEAPI_DEFAULT_URL = "https://backend.oneapi.in/sms/sendotp";
const ONEAPI_TIMEOUT_MS = 10_000;

function hashingKey(): string {
  const dedicated = process.env["OTP_HASH_SECRET"]?.trim();
  if (dedicated && dedicated.length >= 32) return dedicated;
  const base = process.env["SUPABASE_SECRET_KEY"];
  if (!base) throw new Error("SUPABASE_SECRET_KEY is not configured");
  return createHmac("sha256", base).update("zeoxy/auth-hashing/v1").digest("hex");
}

function hmac(value: string): string {
  return createHmac("sha256", hashingKey()).update(value).digest("hex");
}

export function generateOtp(): string {
  const buf = new Uint32Array(1);
  const range = 900_000;
  const limit = Math.floor(0x1_0000_0000 / range) * range;
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0]!;
  } while (n >= limit);
  return String(100_000 + (n % range));
}

export function hashOtp(registrationId: string, code: string): string {
  return hmac(`otp:${registrationId}:${code}`);
}

export function otpMatches(registrationId: string, code: string, storedHash: string): boolean {
  const a = Buffer.from(hashOtp(registrationId, code), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export class OtpSendError extends Error {
  constructor(internalReason: string) {
    super(internalReason);
    this.name = "OtpSendError";
  }
}

export async function sendOtpSms(
  phoneE164: string,
  otp: string,
  customerName: string,
): Promise<void> {
  const apiKey = process.env["ONEAPI_API_KEY"]?.trim();
  const brandName = process.env["ONEAPI_BRAND_NAME"]?.trim();
  const apiUrl = process.env["ONEAPI_API_URL"]?.trim() || ONEAPI_DEFAULT_URL;
  if (!apiKey || !brandName)
    throw new OtpSendError("ONEAPI_API_KEY / ONEAPI_BRAND_NAME not configured");

  const parsed = parsePhoneNumberFromString(phoneE164);
  if (!parsed) throw new OtpSendError("could not parse the mobile number");

  const allowed = (process.env["ONEAPI_SMS_COUNTRIES"] ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  if (allowed.length && (!parsed.country || !allowed.includes(parsed.country))) {
    throw new OtpSendError("number country not enabled for OneAPI");
  }
  const digits =
    parsed.country === "IN"
      ? String(parsed.nationalNumber)
      : `${parsed.countryCallingCode}${parsed.nationalNumber}`;
  if (!/^[1-9]\d{5,14}$/.test(digits) || !/^[1-9]\d{5}$/.test(otp)) {
    throw new OtpSendError("number or code not representable as a JSON number");
  }

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        apiKey,
        brandName,
        customerName: customerName.slice(0, 60),
        number: Number(digits),
        otp: Number(otp),
      }),
      signal: AbortSignal.timeout(ONEAPI_TIMEOUT_MS),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "unknown";
    throw new OtpSendError(`OneAPI request failed: ${name === "TimeoutError" ? "timeout" : name}`);
  }

  const payload = (await res.json().catch(() => null)) as {
    success?: unknown;
    msg?: unknown;
  } | null;
  if (res.status === 200 && payload?.success === true) return;

  const msg =
    typeof payload?.msg === "string"
      ? payload.msg.split(apiKey).join("[redacted]").split(otp).join("[redacted]")
      : "no msg";
  throw new OtpSendError(
    `OneAPI rejected send: HTTP ${res.status}, success=${String(payload?.success)}, msg="${msg.slice(0, 120)}"`,
  );
}

const DOH_TIMEOUT_MS = 4_000;

export type EmailProblem = "disposable" | "no_mailbox" | null;

export async function checkEmailAddress(email: string): Promise<EmailProblem> {
  if (isDisposableEmailDomain(email)) return "disposable";
  const domain = email.split("@").pop()?.trim().toLowerCase();
  if (!domain) return null;
  return (await domainAcceptsMail(domain)) ? null : "no_mailbox";
}

async function domainAcceptsMail(domain: string): Promise<boolean> {
  const base = process.env["DNS_OVER_HTTPS_URL"]?.trim() || "https://cloudflare-dns.com/dns-query";
  const lookup = async (type: "MX" | "A") => {
    const res = await fetch(`${base}?name=${encodeURIComponent(domain)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(DOH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`DoH HTTP ${res.status}`);
    const data = (await res.json()) as { Answer?: { type?: number; data?: string }[] };
    return (data.Answer ?? []).some((a) => a.type === (type === "MX" ? 15 : 1));
  };
  try {
    if (await lookup("MX")) return true;
    return await lookup("A");
  } catch {
    return true;
  }
}

type RateKind = "otp_send_ip" | "otp_send_phone" | "login_ip" | "login_identifier";

export function clientIp(): string {
  const h = getRequest()?.headers;
  const ip =
    h?.get("cf-connecting-ip") ||
    h?.get("x-real-ip") ||
    h?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return ip;
}

export function rateKey(value: string): string {
  return hmac(`rate:${value.toLowerCase()}`);
}

export async function countRecent(
  kind: RateKind,
  keyHash: string,
  windowSeconds: number,
): Promise<number> {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from("auth_rate_events")
    .select("id", { count: "exact" })
    .eq("kind", kind)
    .eq("key_hash", keyHash)
    .gte("created_at", since)
    .limit(1);
  if (error) throw error;
  return count ?? 0;
}

export async function recordEvent(kind: RateKind, keyHash: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("auth_rate_events")
    .insert({ kind, key_hash: keyHash });
  if (error) throw error;
}

export async function cleanupOldRows(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  await Promise.all([
    supabaseAdmin.from("auth_rate_events").delete().lt("created_at", cutoff),
    supabaseAdmin.from("registration_otps").delete().lt("created_at", cutoff),
  ]).catch(() => undefined);
}

export async function usernameTaken(username: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("username", username.toLowerCase())
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function emailTaken(email: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("auth_email_in_use", { _email: email });
  if (error) throw error;
  return data === true;
}

export async function phoneTaken(forms: string[]): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .in("phone", forms)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

export { supabaseAdmin };
