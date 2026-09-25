import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";
import { z } from "zod";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;
export const OTP_LENGTH = 6;
export const DEFAULT_COUNTRY: CountryCode = "IN";

export const USERNAME_GUIDELINE = `${USERNAME_MIN}–${USERNAME_MAX} characters. Start with a letter, then letters, numbers or _`;
export const PASSWORD_GUIDELINE = `At least ${PASSWORD_MIN} characters, with a letter and a number.`;

const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "root",
  "system",
  "support",
  "help",
  "helpdesk",
  "staff",
  "mod",
  "moderator",
  "official",
  "security",
  "billing",
  "payment",
  "payments",
  "owner",
  "team",
  "service",
  "api",
  "null",
  "undefined",
  "zeoxy",
  "recharge",
  "topup",
  "top_up",
  "noreply",
  "no_reply",
  "webmaster",
]);

const USERNAME_PATTERN = new RegExp(`^[a-z][a-z0-9_]{${USERNAME_MIN - 1},${USERNAME_MAX - 1}}$`);

export const usernameSchema = z
  .string()
  .trim()
  .min(1, { message: "Enter a username" })
  .transform((v) => v.toLowerCase())
  .superRefine((v, ctx) => {
    const add = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (v.length < USERNAME_MIN) add(`Username must be at least ${USERNAME_MIN} characters`);
    else if (v.length > USERNAME_MAX) add(`Username must be at most ${USERNAME_MAX} characters`);
    else if (!/^[a-z]/.test(v)) add("Username must start with a letter");
    else if (!USERNAME_PATTERN.test(v)) add("Username can use letters, numbers and _ only");
    else if (v.includes("__")) add("Username can't have two _ in a row");
    else if (v.endsWith("_")) add("Username can't end with _");
  });

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username.trim().toLowerCase());
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, { message: "Enter your email address" })
  .max(254, { message: "Enter a valid email address" })
  .email({ message: "Enter a valid email address" })
  .refine((v) => (v.split("@")[0] ?? "").length <= 64, { message: "Enter a valid email address" })
  .refine((v) => !v.endsWith(".") && !v.includes(".."), { message: "Enter a valid email address" });

export function passwordProblem(
  password: string,
  context: { username?: string; email?: string } = {},
): string | null {
  if (!password) return "Enter a password";
  const length = [...password].length;
  if (length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters`;
  if (!password.trim()) return "Password can't be only spaces";
  if (!/[A-Za-z]/.test(password)) return "Password must include at least one letter";
  if (!/[0-9]/.test(password)) return "Password must include at least one number";
  const lower = password.toLowerCase();
  const handle = context.username?.trim().toLowerCase();
  const mailbox = context.email?.trim().toLowerCase().split("@")[0];
  if (handle && handle.length >= 3 && lower.includes(handle))
    return "Password can't contain your username";
  if (mailbox && mailbox.length >= 3 && lower.includes(mailbox))
    return "Password can't contain your email address";
  return null;
}

export const otpSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), { message: `Enter the ${OTP_LENGTH}-digit code` });

export type MobileResult =
  | { ok: true; e164: string; country: CountryCode; national: string; callingCode: string }
  | { ok: false; message: string };

export function normalizeMobile(country: string, number: string): MobileResult {
  const raw = number.trim();
  if (!raw) return { ok: false, message: "Enter your mobile number" };
  if (!/^[0-9\s()+.-]{4,25}$/.test(raw)) {
    return { ok: false, message: "Mobile number can contain digits only" };
  }
  const selected = (getCountries() as string[]).includes(country) ? (country as CountryCode) : null;
  if (!selected) return { ok: false, message: "Select a country code" };

  const parsed = parsePhoneNumberFromString(raw, selected);
  if (
    !parsed ||
    !parsed.isValid() ||
    parsed.countryCallingCode !== getCountryCallingCode(selected)
  ) {
    return { ok: false, message: "Enter a valid mobile number for the selected country" };
  }
  return {
    ok: true,
    e164: parsed.number,
    country: parsed.country ?? selected,
    national: String(parsed.nationalNumber),
    callingCode: String(parsed.countryCallingCode),
  };
}

export function phoneStorageForms(m: {
  e164: string;
  national: string;
  callingCode: string;
}): string[] {
  return Array.from(
    new Set([m.e164, `${m.callingCode}${m.national}`, m.national, `0${m.national}`]),
  );
}

export function mobileFromE164(
  e164: string,
): { e164: string; national: string; callingCode: string } | null {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return null;
  return {
    e164: parsed.number,
    national: String(parsed.nationalNumber),
    callingCode: String(parsed.countryCallingCode),
  };
}

export function maskMobile(e164: string): string {
  const m = mobileFromE164(e164);
  if (!m) return "your mobile number";
  return `+${m.callingCode} ${"•".repeat(Math.max(0, m.national.length - 4))}${m.national.slice(-4)}`;
}

export function formatMobile(stored: string): string {
  const value = stored.trim();
  if (!value) return "";
  const direct = parsePhoneNumberFromString(value);
  if (direct?.isValid()) return direct.formatInternational();
  if (/^\d{7,15}$/.test(value)) {
    const withPlus = parsePhoneNumberFromString(`+${value}`);
    if (withPlus?.isValid()) return withPlus.formatInternational();
  }
  return value;
}

export type CountryOption = { iso: CountryCode; name: string; dial: string; flag: string };

let countryOptions: CountryOption[] | undefined;

export function getCountryOptions(): CountryOption[] {
  if (countryOptions) return countryOptions;
  const names =
    typeof Intl !== "undefined" && "DisplayNames" in Intl
      ? new Intl.DisplayNames(["en"], { type: "region" })
      : null;
  const flag = (iso: string) =>
    String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  countryOptions = getCountries()
    .map((iso) => ({
      iso,
      name: names?.of(iso) ?? iso,
      dial: `+${getCountryCallingCode(iso)}`,
      flag: flag(iso),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return countryOptions;
}

export type IdentifierType = "username" | "email" | "phone";
export const IDENTIFIER_TYPES: { value: IdentifierType; label: string }[] = [
  { value: "username", label: "Username" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Mobile number" },
];
