import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function makeSign(
  params: Record<string, string>,
  merchantKey: string,
): string {
  const normalized = Object.entries(params)
    .filter(([, value]) => value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");

  const source = normalized + merchantKey;

  const first = createHash("md5")
    .update(source)
    .digest("hex");

  return createHash("md5")
    .update(first)
    .digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function smileResponse(
  status: number,
  roleName = "",
  roleId = "",
  error = "",
) {
  return Response.json(
    {
      status,
      role:
        status === 200
          ? {
              roleName,
              roleId,
            }
          : null,
      error,
    },
    {
      status: 200,
      headers: jsonHeaders,
    },
  );
}

export const Route = createFileRoute(
  "/api/smile/role-check",
)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const contentType =
            request.headers.get("content-type") ?? "";

          if (
            !contentType
              .toLowerCase()
              .includes("application/json")
          ) {
            return smileResponse(
              201,
              "",
              "",
              "Content-Type must be application/json",
            );
          }

          const smileOneKey =
            process.env["SMILE_ONE_KEY"]?.trim();

          if (!smileOneKey) {
            console.error(
              "[SmileOne] SMILE_ONE_KEY is missing",
            );

            return smileResponse(
              500,
              "",
              "",
              "Server configuration error",
            );
          }

          const body =
            (await request.json()) as unknown;

          if (
            !body ||
            typeof body !== "object" ||
            Array.isArray(body)
          ) {
            return smileResponse(
              201,
              "",
              "",
              "Invalid JSON body",
            );
          }

          const input =
            body as Record<string, unknown>;

          const uid =
            typeof input["uid"] === "string"
              ? input["uid"].trim()
              : "";

          const sid =
            typeof input["sid"] === "string"
              ? input["sid"].trim()
              : "";

          const sign =
            typeof input["sign"] === "string"
              ? input["sign"].trim().toLowerCase()
              : "";

          if (!uid) {
            return smileResponse(
              201,
              "",
              "",
              "uid is required",
            );
          }

          if (!sign) {
            return smileResponse(
              201,
              "",
              "",
              "sign is required",
            );
          }

          const signParams: Record<string, string> = {
            uid,
          };

          if (sid) {
            signParams["sid"] = sid;
          }

          const expectedSign = makeSign(
            signParams,
            smileOneKey,
          );

          if (!safeEqual(sign, expectedSign)) {
            console.warn(
              "[SmileOne] Invalid signature",
            );

            return smileResponse(
              205,
              "",
              "",
              "Sign error",
            );
          }

          console.log(
            "[SmileOne] Valid Role Check request",
            {
              uid,
              sid,
            },
          );

          /*
           * TODO:
           * Yahan actual player/role lookup karna hai.
           *
           * Example successful response:
           *
           * return smileResponse(
           *   200,
           *   "PlayerName",
           *   uid,
           *   "",
           * );
           */

          return smileResponse(
            201,
            "",
            "",
            "Role not found",
          );
        } catch (error) {
          console.error(
            "[SmileOne] Role Check error:",
            error,
          );

          return smileResponse(
            500,
            "",
            "",
            "System error",
          );
        }
      },
    },
  },
});