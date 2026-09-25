import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  emailSchema,
  isReservedUsername,
  maskMobile,
  mobileFromE164,
  normalizeMobile,
  otpSchema,
  passwordProblem,
  phoneStorageForms,
  usernameSchema,
} from "@/lib/auth-rules";

type Fail = {
  ok: false;
  message: string;
  field?: "username" | "email" | "phone" | "password" | "otp" | "name";
  code?: string;
};

const fail = (message: string, extra: Omit<Fail, "ok" | "message"> = {}): Fail => ({
  ok: false,
  message,
  ...extra,
});

const str = (max: number) => z.string().max(max);

const TAKEN_USERNAME = "That username is already taken";
const TAKEN_EMAIL = "An account with this email already exists";
const TAKEN_PHONE = "An account with this mobile number already exists";
const DISPOSABLE_EMAIL = "Temporary email addresses aren't allowed. Use your real email address.";
const NO_MAILBOX = "We couldn't find a mail server for that email address. Check the spelling.";

const usernameInput = z.object({ username: str(64) });

export const checkUsername = createServerFn({ method: "POST" })
  .inputValidator((data) => usernameInput.parse(data))
  .handler(async ({ data }) => {
    const auth = await import("@/lib/auth.server");
    const parsed = usernameSchema.safeParse(data.username);
    if (!parsed.success) {
      return { status: "invalid" as const, message: parsed.error.issues[0]!.message };
    }

    const ipKey = auth.rateKey(`uname-check:${auth.clientIp()}`);
    const used = await auth.countRecent(
      "login_ip",
      ipKey,
      auth.LOGIN_POLICY.usernameCheckWindowSeconds,
    );
    if (used >= auth.LOGIN_POLICY.maxUsernameChecks) {
      return { status: "unknown" as const, message: "" };
    }
    await auth.recordEvent("login_ip", ipKey);

    if (isReservedUsername(parsed.data) || (await auth.usernameTaken(parsed.data))) {
      return { status: "taken" as const, message: TAKEN_USERNAME };
    }
    return { status: "available" as const, message: "Username is available" };
  });

const startInput = z.object({
  username: str(64),
  email: str(320),
  phoneCountry: str(4),
  phoneNumber: str(32),
  password: str(256),
});

export const startRegistration = createServerFn({ method: "POST" })
  .inputValidator((data) => startInput.parse(data))
  .handler(async ({ data }) => {
    const auth = await import("@/lib/auth.server");

    const username = usernameSchema.safeParse(data.username);
    if (!username.success) return fail(username.error.issues[0]!.message, { field: "username" });
    const email = emailSchema.safeParse(data.email);
    if (!email.success) return fail(email.error.issues[0]!.message, { field: "email" });
    const mobile = normalizeMobile(data.phoneCountry, data.phoneNumber);
    if (!mobile.ok) return fail(mobile.message, { field: "phone" });
    const badPassword = passwordProblem(data.password, {
      username: username.data,
      email: email.data,
    });
    if (badPassword) return fail(badPassword, { field: "password" });
    if (isReservedUsername(username.data)) return fail(TAKEN_USERNAME, { field: "username" });

    const emailProblem = await auth.checkEmailAddress(email.data);
    if (emailProblem === "disposable") return fail(DISPOSABLE_EMAIL, { field: "email" });
    if (emailProblem === "no_mailbox") return fail(NO_MAILBOX, { field: "email" });

    const [uTaken, eTaken, pTaken] = await Promise.all([
      auth.usernameTaken(username.data),
      auth.emailTaken(email.data),
      auth.phoneTaken(phoneStorageForms(mobile)),
    ]);
    if (uTaken) return fail(TAKEN_USERNAME, { field: "username" });
    if (eTaken) return fail(TAKEN_EMAIL, { field: "email" });
    if (pTaken) return fail(TAKEN_PHONE, { field: "phone" });

    const ipKey = auth.rateKey(`ip:${auth.clientIp()}`);
    const phoneKey = auth.rateKey(`phone:${mobile.e164}`);
    const [ipSends, phoneSends] = await Promise.all([
      auth.countRecent("otp_send_ip", ipKey, 3600),
      auth.countRecent("otp_send_phone", phoneKey, 3600),
    ]);
    if (
      ipSends >= auth.OTP_POLICY.maxSendsPerIpPerHour ||
      phoneSends >= auth.OTP_POLICY.maxSendsPerPhonePerHour
    ) {
      return fail("Too many codes requested. Please try again in an hour.", {
        code: "RATE_LIMITED",
      });
    }

    void auth.cleanupOldRows();

    const id = crypto.randomUUID();
    const code = auth.generateOtp();
    const expiresAt = new Date(Date.now() + auth.OTP_POLICY.ttlSeconds * 1000).toISOString();
    const { error: insertErr } = await auth.supabaseAdmin.from("registration_otps").insert({
      id,
      username: username.data,
      display_name: data.username.trim(),
      email: email.data,
      phone: mobile.e164,
      code_hash: auth.hashOtp(id, code),
      expires_at: expiresAt,
    });
    if (insertErr) throw insertErr;

    await Promise.all([
      auth.recordEvent("otp_send_ip", ipKey),
      auth.recordEvent("otp_send_phone", phoneKey),
    ]);
    try {
      await auth.sendOtpSms(mobile.e164, code, data.username.trim());
    } catch (err) {
      await auth.supabaseAdmin.from("registration_otps").delete().eq("id", id);
      console.error(`[register] OTP not sent: ${err instanceof Error ? err.message : "unknown"}`);
      return fail(
        "We couldn't send the verification code to that number. Please check it and try again.",
        {
          field: "phone",
          code: "OTP_SEND_FAILED",
        },
      );
    }

    return {
      ok: true as const,
      registrationId: id,
      maskedPhone: maskMobile(mobile.e164),
      expiresIn: auth.OTP_POLICY.ttlSeconds,
      resendIn: auth.OTP_POLICY.resendCooldownSeconds,
    };
  });

const idInput = z.object({ registrationId: z.string().uuid() });

export const resendRegistrationOtp = createServerFn({ method: "POST" })
  .inputValidator((data) => idInput.parse(data))
  .handler(async ({ data }) => {
    const auth = await import("@/lib/auth.server");
    const { data: row, error } = await auth.supabaseAdmin
      .from("registration_otps")
      .select("id, display_name, phone, last_sent_at, send_count, consumed_at")
      .eq("id", data.registrationId)
      .maybeSingle();
    if (error) throw error;
    if (!row || row.consumed_at)
      return fail("This sign-up has expired. Please start again.", { code: "NOT_FOUND" });

    const wait =
      auth.OTP_POLICY.resendCooldownSeconds -
      Math.floor((Date.now() - new Date(row.last_sent_at).getTime()) / 1000);
    if (wait > 0)
      return fail(`Please wait ${wait} seconds before requesting a new code.`, {
        code: "COOLDOWN",
      });
    if (row.send_count >= auth.OTP_POLICY.maxSendsPerRegistration) {
      return fail("Too many codes requested. Please start again later.", { code: "RATE_LIMITED" });
    }

    const ipKey = auth.rateKey(`ip:${auth.clientIp()}`);
    const phoneKey = auth.rateKey(`phone:${row.phone}`);
    const [ipSends, phoneSends] = await Promise.all([
      auth.countRecent("otp_send_ip", ipKey, 3600),
      auth.countRecent("otp_send_phone", phoneKey, 3600),
    ]);
    if (
      ipSends >= auth.OTP_POLICY.maxSendsPerIpPerHour ||
      phoneSends >= auth.OTP_POLICY.maxSendsPerPhonePerHour
    ) {
      return fail("Too many codes requested. Please try again in an hour.", {
        code: "RATE_LIMITED",
      });
    }

    const code = auth.generateOtp();
    await Promise.all([
      auth.recordEvent("otp_send_ip", ipKey),
      auth.recordEvent("otp_send_phone", phoneKey),
    ]);
    try {
      await auth.sendOtpSms(row.phone, code, row.display_name);
    } catch (err) {
      console.error(
        `[register] OTP resend failed: ${err instanceof Error ? err.message : "unknown"}`,
      );
      return fail("We couldn't send the verification code. Please try again.", {
        code: "OTP_SEND_FAILED",
      });
    }

    const { error: updErr } = await auth.supabaseAdmin
      .from("registration_otps")
      .update({
        code_hash: auth.hashOtp(row.id, code),
        attempts: 0,
        expires_at: new Date(Date.now() + auth.OTP_POLICY.ttlSeconds * 1000).toISOString(),
        last_sent_at: new Date().toISOString(),
        send_count: row.send_count + 1,
      })
      .eq("id", row.id)
      .is("consumed_at", null);
    if (updErr) throw updErr;

    return {
      ok: true as const,
      maskedPhone: maskMobile(row.phone),
      expiresIn: auth.OTP_POLICY.ttlSeconds,
      resendIn: auth.OTP_POLICY.resendCooldownSeconds,
    };
  });

const verifyInput = z.object({
  registrationId: z.string().uuid(),
  otp: str(16),
  password: str(256),
});

export const verifyRegistration = createServerFn({ method: "POST" })
  .inputValidator((data) => verifyInput.parse(data))
  .handler(async ({ data }) => {
    const auth = await import("@/lib/auth.server");

    const otp = otpSchema.safeParse(data.otp);
    if (!otp.success) return fail(otp.error.issues[0]!.message, { field: "otp" });

    const { data: attempt, error: attErr } = await auth.supabaseAdmin.rpc(
      "registration_otp_attempt",
      { _id: data.registrationId },
    );
    if (attErr) throw attErr;
    const a = attempt?.[0];
    if (!a || a.consumed_at)
      return fail("This sign-up has expired. Please start again.", { code: "NOT_FOUND" });
    if (new Date(a.expires_at).getTime() <= Date.now()) {
      return fail("This code has expired. Request a new code.", {
        field: "otp",
        code: "OTP_EXPIRED",
      });
    }
    if (a.attempts > auth.OTP_POLICY.maxAttempts) {
      return fail("Too many incorrect attempts. Request a new code.", {
        field: "otp",
        code: "OTP_ATTEMPTS",
      });
    }
    if (!auth.otpMatches(data.registrationId, otp.data, a.code_hash)) {
      const left = auth.OTP_POLICY.maxAttempts - a.attempts;
      return left > 0
        ? fail(`Incorrect code. ${left} ${left === 1 ? "attempt" : "attempts"} left.`, {
            field: "otp",
            code: "OTP_INVALID",
          })
        : fail("Too many incorrect attempts. Request a new code.", {
            field: "otp",
            code: "OTP_ATTEMPTS",
          });
    }

    const { data: claimed, error: claimErr } = await auth.supabaseAdmin
      .from("registration_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", data.registrationId)
      .is("consumed_at", null)
      .select("id, username, display_name, email, phone")
      .maybeSingle();
    if (claimErr) throw claimErr;
    if (!claimed) return fail("This code has already been used.", { code: "NOT_FOUND" });

    const release = () =>
      auth.supabaseAdmin
        .from("registration_otps")
        .update({ consumed_at: null })
        .eq("id", claimed.id);

    const badPassword = passwordProblem(data.password, {
      username: claimed.username,
      email: claimed.email,
    });
    if (badPassword) {
      await release();
      return fail(badPassword, { field: "password" });
    }

    const mobile = mobileFromE164(claimed.phone);
    const [uTaken, eTaken, pTaken] = await Promise.all([
      auth.usernameTaken(claimed.username),
      auth.emailTaken(claimed.email),
      auth.phoneTaken(mobile ? phoneStorageForms(mobile) : [claimed.phone]),
    ]);
    if (uTaken || eTaken || pTaken) {
      await auth.supabaseAdmin.from("registration_otps").delete().eq("id", claimed.id);
      if (uTaken)
        return fail("That username was just taken. Please register again.", { code: "TAKEN" });
      if (eTaken) return fail(TAKEN_EMAIL, { code: "TAKEN" });
      return fail(TAKEN_PHONE, { code: "TAKEN" });
    }

    const { error: createErr } = await auth.supabaseAdmin.auth.admin.createUser({
      email: claimed.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        username: claimed.username,
        display_name: claimed.display_name,
        phone: claimed.phone,
      },
    });
    if (createErr) {
      const msg = createErr.message.toLowerCase();
      if (msg.includes("already") || msg.includes("exists")) {
        await auth.supabaseAdmin.from("registration_otps").delete().eq("id", claimed.id);
        return fail(TAKEN_EMAIL, { code: "TAKEN" });
      }
      if (msg.includes("password")) {
        await release();
        return fail(createErr.message, { field: "password" });
      }
      await release();
      console.error(`[register] createUser failed: ${createErr.message}`);
      return fail("Couldn't create your account. Please try again.", { code: "CREATE_FAILED" });
    }

    await auth.supabaseAdmin.from("registration_otps").delete().eq("id", claimed.id);
    return { ok: true as const, email: claimed.email };
  });

const loginInput = z.object({
  identifierType: z.enum(["username", "email", "phone"]),
  identifier: str(320).optional(),
  phoneCountry: str(4).optional(),
  phoneNumber: str(32).optional(),
  password: str(256),
});

const LOGIN_FAILED = "Wrong username, email, mobile number or password";

export const resolveLoginEmail = createServerFn({ method: "POST" })
  .inputValidator((data) => loginInput.parse(data))
  .handler(async ({ data }) => {
    const auth = await import("@/lib/auth.server");
    if (!data.password) return fail(LOGIN_FAILED, { code: "INVALID_LOGIN" });

    let username: string | null = null;
    let phones: string[] | null = null;
    if (data.identifierType === "username") {
      const parsed = usernameSchema.safeParse(data.identifier ?? "");
      if (!parsed.success) return fail(LOGIN_FAILED, { code: "INVALID_LOGIN" });
      username = parsed.data;
    } else if (data.identifierType === "email") {
      const parsed = emailSchema.safeParse(data.identifier ?? "");
      if (!parsed.success) return fail(LOGIN_FAILED, { code: "INVALID_LOGIN" });
      return { ok: true as const, email: parsed.data };
    } else {
      const mobile = normalizeMobile(data.phoneCountry ?? "", data.phoneNumber ?? "");
      if (!mobile.ok) return fail(mobile.message, { field: "phone", code: "INVALID_LOGIN" });
      phones = phoneStorageForms(mobile);
    }

    const ipKey = auth.rateKey(`ip:${auth.clientIp()}`);
    const idKey = auth.rateKey(`id:${username ?? phones?.[0] ?? ""}`);
    const w = auth.LOGIN_POLICY.windowSeconds;
    const [byIp, byId] = await Promise.all([
      auth.countRecent("login_ip", ipKey, w),
      auth.countRecent("login_identifier", idKey, w),
    ]);
    if (byIp >= auth.LOGIN_POLICY.maxPerIp || byId >= auth.LOGIN_POLICY.maxPerIdentifier) {
      return fail("Too many login attempts. Please wait a few minutes and try again.", {
        code: "RATE_LIMITED",
      });
    }
    await Promise.all([
      auth.recordEvent("login_ip", ipKey),
      auth.recordEvent("login_identifier", idKey),
    ]);

    const { data: email, error } = await auth.supabaseAdmin.rpc("resolve_login_email", {
      _username: username as string,
      _phones: phones as string[],
      _password: data.password,
    });
    if (error) throw error;
    if (typeof email !== "string" || !email) return fail(LOGIN_FAILED, { code: "INVALID_LOGIN" });
    return { ok: true as const, email };
  });

export const getAccountStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/lib/auth.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("needs_email")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw error;
    return { needsEmail: Boolean(data?.needs_email) };
  });

const emailInput = z.object({ email: str(320) });

export const setAccountEmail = createServerFn({ method: "POST" })
  .inputValidator((data) => emailInput.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const auth = await import("@/lib/auth.server");
    const email = emailSchema.safeParse(data.email);
    if (!email.success) return fail(email.error.issues[0]!.message, { field: "email" });

    const { data: profile, error } = await auth.supabaseAdmin
      .from("profiles")
      .select("needs_email")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!profile?.needs_email)
      return fail("Your account already has an email address.", { code: "NOT_NEEDED" });

    const emailProblem = await auth.checkEmailAddress(email.data);
    if (emailProblem === "disposable") return fail(DISPOSABLE_EMAIL, { field: "email" });
    if (emailProblem === "no_mailbox") return fail(NO_MAILBOX, { field: "email" });
    if (await auth.emailTaken(email.data)) return fail(TAKEN_EMAIL, { field: "email" });

    const { error: updErr } = await auth.supabaseAdmin.auth.admin.updateUserById(context.userId, {
      email: email.data,
      email_confirm: true,
    });
    if (updErr) {
      console.error(`[account] email update failed: ${updErr.message}`);
      return fail("Couldn't save your email. Please try again.", { code: "UPDATE_FAILED" });
    }
    const { error: flagErr } = await auth.supabaseAdmin
      .from("profiles")
      .update({ needs_email: false })
      .eq("id", context.userId);
    if (flagErr) throw flagErr;
    return { ok: true as const };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const auth = await import("@/lib/auth.server");
    const [profileRes, userRes, rolesRes, ordersRes] = await Promise.all([
      auth.supabaseAdmin
        .from("profiles")
        .select("username, display_name, phone, needs_email, created_at")
        .eq("id", context.userId)
        .maybeSingle(),
      auth.supabaseAdmin.auth.admin.getUserById(context.userId),
      auth.supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId),
      auth.supabaseAdmin
        .from("orders")
        .select("status, selling_price")
        .eq("user_id", context.userId),
    ]);
    if (profileRes.error) throw profileRes.error;
    if (userRes.error) throw userRes.error;
    if (rolesRes.error) throw rolesRes.error;
    if (ordersRes.error) throw ordersRes.error;

    const orders = ordersRes.data ?? [];
    const completed = orders.filter((o) => o.status === "completed");

    return {
      username: profileRes.data?.username ?? "",
      displayName: profileRes.data?.display_name ?? "",
      email: userRes.data.user?.email ?? "",
      mobile: profileRes.data?.phone ?? "",
      needsEmail: Boolean(profileRes.data?.needs_email),
      joinedAt: profileRes.data?.created_at ?? userRes.data.user?.created_at ?? "",
      isAdmin: (rolesRes.data ?? []).some((r) => r.role === "admin"),
      orderCount: orders.length,
      completedCount: completed.length,
      spent: completed.reduce((sum, o) => sum + Number(o.selling_price ?? 0), 0),
    };
  });

const profileInput = z.object({ username: str(64), displayName: str(60) });

export const updateMyProfile = createServerFn({ method: "POST" })
  .inputValidator((data) => profileInput.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const auth = await import("@/lib/auth.server");

    const username = usernameSchema.safeParse(data.username);
    if (!username.success) return fail(username.error.issues[0]!.message, { field: "username" });
    const displayName = data.displayName.trim();
    if (displayName.length < 2)
      return fail("Enter a name of at least 2 characters", { field: "name" });
    if (displayName.length > 40)
      return fail("Name must be at most 40 characters", { field: "name" });

    const { data: current, error: currentErr } = await auth.supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", context.userId)
      .maybeSingle();
    if (currentErr) throw currentErr;

    const changingUsername = (current?.username ?? "").toLowerCase() !== username.data;
    if (changingUsername) {
      if (isReservedUsername(username.data) || (await auth.usernameTaken(username.data))) {
        return fail(TAKEN_USERNAME, { field: "username" });
      }
    }

    const { error } = await auth.supabaseAdmin
      .from("profiles")
      .update({ username: username.data, display_name: displayName })
      .eq("id", context.userId);
    if (error) throw error;

    await auth.supabaseAdmin.auth.admin.updateUserById(context.userId, {
      user_metadata: { username: username.data, display_name: displayName },
    });

    return { ok: true as const, username: username.data, displayName };
  });
