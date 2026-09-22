import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const listProductsSchema = z.object({
  product: z.string().trim().min(1).max(60),
});

const assignProductSchema = z.object({
  packageId: z.string().uuid(),
  smileProductId: z.string().trim().min(1).max(100),
});

export type SmileProduct = {
  id: string | number;
  spu: string;
  price: string | number;
};

function makeSign(
  params: Record<string, string>,
  merchantKey: string,
): string {
  const source =
    Object.keys(params)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => `${key}=${params[key]}&`)
      .join("") + merchantKey;

  const first = createHash("md5").update(source, "utf8").digest("hex");
  return createHash("md5").update(first, "utf8").digest("hex");
}

async function requireAdmin(
  supabase: {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
  },
  userId: string,
) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });

  if (error || !data) {
    throw new Error("Forbidden");
  }
}

async function postForm(
  url: string,
  params: Record<string, string>,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(params),
  });

  const text = await response.text();

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Keep a useful message below when the upstream is not JSON.
  }

  if (!response.ok) {
    throw new Error(
      `Smile One HTTP ${response.status}: ${
        typeof parsed === "object" && parsed !== null
          ? JSON.stringify(parsed)
          : text.slice(0, 300)
      }`,
    );
  }

  return parsed;
}

export const listSmileProducts = createServerFn({ method: "POST" })
  .inputValidator((data) => listProductsSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase as any, userId);

    const email = process.env["SMILE_ONE_EMAIL"]?.trim();
    const uid = process.env["SMILE_ONE_UID"]?.trim();
    const key = process.env["SMILE_ONE_KEY"]?.trim();
    const baseUrl =
      process.env["SMILE_ONE_API_URL"]?.trim() ||
      "https://www.smile.one";

    if (!email || !uid || !key) {
      throw new Error(
        "Missing SMILE_ONE_EMAIL, SMILE_ONE_UID or SMILE_ONE_KEY",
      );
    }

    const params = {
      uid,
      email,
      product: data.product,
      time: String(Math.floor(Date.now() / 1000)),
    };

    const result = (await postForm(
      `${baseUrl}/smilecoin/api/productlist`,
      {
        ...params,
        sign: makeSign(params, key),
      },
    )) as {
      status?: number;
      message?: string;
      data?: {
        product?: Array<{
          id?: string | number;
          spu?: string;
          price?: string | number;
        }>;
      };
    };

    if (result?.status !== 200) {
      throw new Error(
        result?.message || "Smile One product list request failed",
      );
    }

    const products = (result.data?.product ?? [])
      .filter((p) => p.id !== undefined && p.id !== null)
      .map((p) => ({
        id: p.id!,
        spu: String(p.spu ?? ""),
        price: p.price ?? "",
      }));

    return { products };
  });

export const assignSmileProduct = createServerFn({ method: "POST" })
  .inputValidator((data) => assignProductSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase as any, userId);

    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");

    const { data: pack, error: packError } = await (supabaseAdmin as any)
      .from("packages")
      .select("id, label")
      .eq("id", data.packageId)
      .maybeSingle();

    if (packError) throw packError;
    if (!pack) throw new Error("Recharge package not found");

    const { error } = await (supabaseAdmin as any)
      .from("packages")
      .update({
        smile_product_id: data.smileProductId,
      })
      .eq("id", data.packageId);

    if (error) throw error;

    return {
      ok: true,
      packageId: pack.id,
      packageLabel: pack.label,
      smileProductId: data.smileProductId,
    };
  });