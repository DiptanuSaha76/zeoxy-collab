import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

type SmileRoleResponse = {
  status?: number;
  username?: string;
  zone?: number | string;
  change_price?: number;
  use?: string;
  message?: string;
};

function makeSign(
  params: Record<string, string>,
  merchantKey: string,
): string {
  // Smile One PDF:
  // sort fields by key, append key=value& for every field,
  // append merchant key, then MD5 twice.
  const source =
    Object.keys(params)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => `${key}=${params[key]}&`)
      .join("") + merchantKey;

  const first = createHash("md5").update(source, "utf8").digest("hex");
  return createHash("md5").update(first, "utf8").digest("hex");
}

function productNameFromSlug(slug: string): string {
  const map: Record<string, string> = {
    "mobile-legends": "mobilelegends",
    "free-fire": "freefire",
    "pubg-mobile": "pubgmobile",
    "genshin-impact": "genshinimpact",
    bgmi: "pubgmobile",
  };

  return (
    map[slug] ??
    slug.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
  );
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

  const raw = await response.text();

  let json: unknown = null;

  try {
    json = JSON.parse(raw);
  } catch {
    // Handled by the HTTP/error checks below.
  }

  if (!response.ok) {
    throw new Error(
      `Smile One HTTP ${response.status}: ${
        typeof json === "object" && json !== null
          ? JSON.stringify(json)
          : raw.slice(0, 300)
      }`,
    );
  }

  return json;
}

export const Route = createFileRoute("/api/smile/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body =
            (await request.json()) as Record<string, unknown>;

          const userid =
            typeof body["uid"] === "string"
              ? body["uid"].trim()
              : "";

          const zoneid =
            typeof body["sid"] === "string"
              ? body["sid"].trim()
              : "";

          const packageId =
            typeof body["packageId"] === "string"
              ? body["packageId"].trim()
              : "";

          if (!userid) {
            return Response.json(
              {
                status: 201,
                nickname: "",
                error: "uid is required",
              },
              { headers: jsonHeaders },
            );
          }

          if (!packageId) {
            return Response.json(
              {
                status: 201,
                nickname: "",
                error: "packageId is required",
              },
              { headers: jsonHeaders },
            );
          }

          /*
           * The PDF requires zoneid for Smile One Role Query.
           * The current Zeoxy Mobile Legends flow supplies it.
           */
          if (!zoneid) {
            return Response.json(
              {
                status: 201,
                nickname: "",
                error: "zoneid is required for Smile One role query",
              },
              { headers: jsonHeaders },
            );
          }

          const email =
            process.env["SMILE_ONE_EMAIL"]?.trim();

          const merchantUid =
            process.env["SMILE_ONE_UID"]?.trim();

          const merchantKey =
            process.env["SMILE_ONE_KEY"]?.trim();

          const baseUrl =
            process.env["SMILE_ONE_API_URL"]?.trim() ||
            "https://www.smile.one";

          if (!email || !merchantUid || !merchantKey) {
            return Response.json(
              {
                status: 500,
                nickname: "",
                error:
                  "Smile One server configuration is incomplete",
              },
              { headers: jsonHeaders },
            );
          }

          /*
           * IMPORTANT:
           * Resolve the Smile product ID on the server from the
           * selected Zeoxy package. We do not accept productid
           * or product amount from the browser.
           */
          const { supabaseAdmin } =
            await import(
              "@/integrations/supabase/client.server"
            );

          const { data: pack, error: packError } =
            await supabaseAdmin
              .from("packages")
              .select(
                "id, game_id, smile_product_id, is_active",
              )
              .eq("id", packageId)
              .maybeSingle();

          if (packError) {
            throw packError;
          }

          if (!pack || !pack.is_active) {
            return Response.json(
              {
                status: 201,
                nickname: "",
                error: "Selected recharge package is not available",
              },
              { headers: jsonHeaders },
            );
          }

          const smileProductId =
            typeof pack.smile_product_id === "string"
              ? pack.smile_product_id.trim()
              : "";

          if (!smileProductId) {
            return Response.json(
              {
                status: 201,
                nickname: "",
                error:
                  "This recharge package is not linked to a Smile One product yet",
              },
              { headers: jsonHeaders },
            );
          }

          const { data: game, error: gameError } =
            await supabaseAdmin
              .from("games")
              .select("id, slug, is_active")
              .eq("id", pack.game_id)
              .maybeSingle();

          if (gameError) {
            throw gameError;
          }

          if (!game || !game.is_active) {
            return Response.json(
              {
                status: 201,
                nickname: "",
                error: "Selected game is not available",
              },
              { headers: jsonHeaders },
            );
          }

          const product =
            productNameFromSlug(game.slug);

          const roleParams: Record<string, string> = {
            email,
            uid: merchantUid,
            userid,
            zoneid,
            product,
            productid: smileProductId,
            time: String(
              Math.floor(Date.now() / 1000),
            ),
          };

          const roleResult =
            (await postForm(
              `${baseUrl}/smilecoin/api/getrole`,
              {
                ...roleParams,
                sign: makeSign(
                  roleParams,
                  merchantKey,
                ),
              },
            )) as SmileRoleResponse;

          if (roleResult?.status !== 200) {
            return Response.json(
              {
                status:
                  Number(roleResult?.status ?? 201),
                nickname: "",
                error:
                  roleResult?.message ||
                  "Smile One could not verify this account",
              },
              { headers: jsonHeaders },
            );
          }

          const nickname =
            String(roleResult.username ?? "").trim();

          if (!nickname) {
            return Response.json(
              {
                status: 201,
                nickname: "",
                error:
                  "Smile One verified the account but returned no username",
              },
              { headers: jsonHeaders },
            );
          }

          return Response.json(
            {
              status: 200,
              nickname,
              error: "",
            },
            { headers: jsonHeaders },
          );
        } catch (error) {
          console.error(
            "[SmileOne] verify error",
            error,
          );

          return Response.json(
            {
              status: 500,
              nickname: "",
              error:
                error instanceof Error
                  ? error.message
                  : "Smile One verification failed",
            },
            { headers: jsonHeaders },
          );
        }
      },
    },
  },
});
