import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";

import { useQuery } from "@tanstack/react-query";

import {
  useEffect,
  useState,
} from "react";

import { toast } from "sonner";

import { z } from "zod";

import {
  ArrowLeft,
  ShieldCheck,
  TicketPercent,
  BadgeCheck,
  UserRoundCheck,
  Loader2,
} from "lucide-react";

import { useServerFn } from "@tanstack/react-start";

import { PageShell } from "@/components/PageShell";

import {
  activeCoinRateQuery,
  gamesQuery,
  money,
  packsQuery,
  settingsQuery,
  validatePlayerId,
  validateServerId,
} from "@/lib/store";

import {
  computePricing,
  customerPrice,
} from "@/lib/pricing";

import { createUpiPayment } from "@/lib/payment.functions";

import {
  useAuth,
} from "@/hooks/useAuth";


const searchSchema = z.object({
  pack: z.string().optional(),
});


type RoleCheckResponse = {
  status: number;
  nickname?: string;
  error?: string;
};


export const Route = createFileRoute(
  "/topup/$slug",
)({
  validateSearch:
    searchSchema,

  head: ({ params }) => {
    const name =
      params.slug
        .split("-")
        .map(
          (w) =>
            w.charAt(0).toUpperCase() +
            w.slice(1),
        )
        .join(" ");

    return {
      meta: [
        {
          title: `Top up ${name} — ZEXY STORE`,
        },
        {
          name: "description",
          content:
            `Buy ${name} in-game currency with instant delivery and secure payments.`,
        },
        {
          property: "og:title",
          content:
            `Top up ${name} — ZEXY STORE`,
        },
        {
          property: "og:description",
          content:
            `Buy ${name} in-game currency with instant delivery.`,
        },
      ],
    };
  },

  component: TopUpPage,
});


function TopUpPage() {
  const { slug } =
    Route.useParams();

  const search =
    Route.useSearch();

  const navigate =
    useNavigate();

  const {
    user,
    loading,
  } = useAuth();


  const {
    data: games = [],
    isLoading:
    gamesLoading,
  } = useQuery(
    gamesQuery(),
  );

  const {
    data: settings,
  } = useQuery(
    settingsQuery(),
  );

  const {
    data: rate,
  } = useQuery(
    activeCoinRateQuery(),
  );

  const createPayment = useServerFn(createUpiPayment);


  const percent =
    settings
      ?.discount_percent ?? 0;


  const priceOf = (
    p: {
      price: number;
      smile_coin_cost: number;
    },
  ) =>
    customerPrice(
      p,
      rate,
      percent,
    );


  const listPriceOf = (
    p: {
      price: number;
      smile_coin_cost: number;
    },
  ) =>
    computePricing(
      p,
      rate,
    ).selling_price;


  const game =
    games.find(
      (g) =>
        g.slug === slug,
    );


  const {
    data: packs = [],
  } = useQuery({
    ...packsQuery(
      game?.id,
    ),
    enabled:
      Boolean(game?.id),
  });


  const [
    selected,
    setSelected,
  ] = useState<
    string | null
  >(
    search.pack ?? null,
  );


  const [
    playerRef,
    setPlayerRef,
  ] = useState("");


  const [
    playerServer,
    setPlayerServer,
  ] = useState("");


  const [
    submitting,
    setSubmitting,
  ] = useState(false);


  const [
    verifying,
    setVerifying,
  ] = useState(false);


  const [
    verified,
    setVerified,
  ] = useState(false);


  const [
    nickname,
    setNickname,
  ] = useState<
    string | null
  >(null);


  const [
    verifiedUid,
    setVerifiedUid,
  ] = useState<
    string | null
  >(null);


  const [
    verifiedSid,
    setVerifiedSid,
  ] = useState<
    string | null
  >(null);


  const [
    verificationError,
    setVerificationError,
  ] = useState<
    string | null
  >(null);


  const [
    coupon,
    setCoupon,
  ] = useState("");


  const [
    appliedCoupon,
    setAppliedCoupon,
  ] = useState<
    string | null
  >(null);


  useEffect(() => {
    if (
      !selected &&
      packs.length
    ) {
      setSelected(
        packs.find(
          (p) =>
            p.is_popular,
        )?.id ??
        packs[0]!.id,
      );
    }
  }, [
    packs,
    selected,
  ]);


  const pack =
    packs.find(
      (p) =>
        p.id === selected,
    );


  /**
   * Reset verification whenever
   * UID/SID changes.
   */
  function resetVerification() {
    setVerified(false);
    setNickname(null);
    setVerifiedUid(null);
    setVerifiedSid(null);
    setVerificationError(null);
  }


  /**
   * ============================================================
   * VERIFY ID
   * ============================================================
   *
   * Browser sends ONLY UID + SID.
   *
   * No Smile One credentials
   * are exposed here.
   */
  async function verifyId() {
    if (!game) {
      return;
    }


    const cleanUid =
      playerRef.trim();

    const cleanSid =
      playerServer.trim();

    if (!pack) {
      const message = "Please select a recharge package.";
      setVerificationError(message);
      toast.error(message);
      return;
    }


    /**
     * Local UID validation.
     */
    const idError =
      validatePlayerId(
        game,
        cleanUid,
      );

    if (idError) {
      setVerified(false);
      setNickname(null);
      setVerificationError(
        idError,
      );

      toast.error(
        idError,
      );

      return;
    }


    /**
     * Local SID validation.
     */
    const serverError =
      validateServerId(
        game,
        cleanSid,
      );

    if (serverError) {
      setVerified(false);
      setNickname(null);
      setVerificationError(
        serverError,
      );

      toast.error(
        serverError,
      );

      return;
    }


    setVerifying(true);

    setVerified(false);

    setNickname(null);

    setVerificationError(
      null,
    );


    try {
      /**
       * Our own server endpoint.
       */
      const response =
        await fetch(
          "/api/smile/verify",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              Accept:
                "application/json",
            },

            body:
              JSON.stringify({
                uid: cleanUid,
                sid: game.requires_server_id ? cleanSid : "",
                packageId: pack.id,
              }),
          },
        );


      let result:
        | RoleCheckResponse
        | null = null;


      try {
        result =
          (await response.json()) as RoleCheckResponse;
      } catch {
        result = null;
      }


      /**
       * HTTP error.
       */
      if (!response.ok) {
        throw new Error(
          result?.error ||
          "Unable to verify this account.",
        );
      }


      /**
       * Smile One-compatible
       * success status.
       */
      if (
        !result ||
        result.status !== 200
      ) {
        throw new Error(
          result?.error ||
          "This player ID could not be verified.",
        );
      }

      /**
       * Nickname must be returned.
       *
       * This is the real verification flow.
       * Temporary sign-generation test handling
       * has been removed.
       */
      const returnedNickname =
        result.nickname?.trim();

      if (!returnedNickname) {
        throw new Error(
          "No nickname was returned for this account.",
        );
      }

      /**
       * Successful verification.
       */
      setNickname(
        returnedNickname,
      );

      setVerifiedUid(
        cleanUid,
      );

      setVerifiedSid(
        game.requires_server_id
          ? cleanSid
          : null,
      );

      setVerified(true);

      toast.success(
        `Account verified: ${returnedNickname}`,
      );

    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not verify this account.";


      setVerified(false);

      setNickname(null);

      setVerifiedUid(null);

      setVerifiedSid(null);

      setVerificationError(
        message,
      );

      toast.error(
        message,
      );
    } finally {
      setVerifying(false);
    }
  }


  /**
   * ============================================================
   * COUPON
   * ============================================================
   */
  function applyCoupon() {
    const code =
      coupon
        .trim()
        .toUpperCase();


    if (!code) {
      toast.error(
        "Enter a coupon code",
      );

      return;
    }


    setAppliedCoupon(
      code,
    );

    toast.success(
      `Coupon ${code} applied`,
    );
  }


  /**
   * ============================================================
   * CHECKOUT
   * ============================================================
   */
  async function checkout() {
    if (
      !game ||
      !pack ||
      !user
    ) {
      return;
    }


    /**
     * Checkout cannot happen
     * before verification.
     */
    if (!verified) {
      toast.error(
        "Please verify your player account first.",
      );

      return;
    }


    const cleanUid =
      playerRef.trim();

    const cleanSid =
      playerServer.trim();


    /**
     * Make sure UID has not changed
     * after verification.
     */
    if (
      verifiedUid !==
      cleanUid
    ) {
      setVerified(false);
      setNickname(null);

      toast.error(
        "Player ID changed. Please verify again.",
      );

      return;
    }


    /**
     * Make sure SID has not changed
     * after verification.
     */
    if (
      game.requires_server_id &&
      verifiedSid !==
      cleanSid
    ) {
      setVerified(false);
      setNickname(null);

      toast.error(
        "Server ID changed. Please verify again.",
      );

      return;
    }


    /**
     * Local validation again.
     */
    const idError =
      validatePlayerId(
        game,
        cleanUid,
      );

    if (idError) {
      toast.error(
        idError,
      );

      return;
    }


    const serverError =
      validateServerId(
        game,
        cleanSid,
      );

    if (serverError) {
      toast.error(
        serverError,
      );

      return;
    }


    setSubmitting(true);


    try {
      const result = await createPayment({
        data: {
          gameId: game.id,
          packageId: pack.id,
          playerRef: cleanUid,
          playerServer: game.requires_server_id ? cleanSid : null,
        },
      });

      window.location.assign(result.paymentUrl);
    } catch (error) {
      console.error("[Checkout] Payment error:", error);

      const message =
        error instanceof Error
          ? error.message
          : "Could not create payment";

      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }


  return (
    <PageShell>

      {/* ====================================================== */}
      {/* BACK */}
      {/* ====================================================== */}

      <div className="mt-5 px-4 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[11px] text-subtle"
        >
          <ArrowLeft className="size-3.5" />
          Back to store
        </Link>
      </div>


      {game ? (
        <div className="mt-3 grid gap-5 px-4 sm:px-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">

          <div className="space-y-5">

            {/* ================================================= */}
            {/* GAME HEADER */}
            {/* ================================================= */}

            <section>
              <div className="glass-panel flex items-center gap-3 rounded-3xl p-3">

                {game.cover_url ? (
                  <img
                    src={
                      game.cover_url
                    }
                    alt={
                      game.name
                    }
                    width={512}
                    height={512}
                    className="size-16 rounded-2xl object-cover sm:size-20"
                  />
                ) : (
                  <div className="size-16 rounded-2xl bg-muted sm:size-20" />
                )}

                <div>
                  <h1 className="font-display text-lg font-semibold leading-tight sm:text-2xl">
                    {game.name}
                  </h1>

                  <p className="text-[11px] text-faint sm:text-xs">
                    {game.category}{" "}
                    ·{" "}
                    {game.currency_label}
                  </p>
                </div>

              </div>
            </section>


            {/* ================================================= */}
            {/* ACCOUNT VERIFICATION */}
            {/* ================================================= */}

            <section>

              <p className="mb-2 font-display text-sm font-medium text-subtle">
                Account verification
              </p>


              <div className="glass-panel grid gap-3 rounded-3xl p-4 sm:grid-cols-2">

                {/* UID */}
                <div>
                  <label
                    htmlFor="player-ref"
                    className="mb-1.5 block text-[10px] uppercase tracking-[0.15em] text-faint"
                  >
                    {game.id_label}
                  </label>

                  <input
                    id="player-ref"
                    inputMode={
                      game.id_kind ===
                        "numeric"
                        ? "numeric"
                        : "text"
                    }
                    value={
                      playerRef
                    }
                    disabled={
                      verifying
                    }
                    onChange={(
                      e,
                    ) => {
                      const raw =
                        e.target
                          .value;

                      const next =
                        game.id_kind ===
                          "numeric"
                          ? raw.replace(
                            /\D/g,
                            "",
                          )
                          : raw;

                      setPlayerRef(
                        next.slice(
                          0,
                          game.id_max_len,
                        ),
                      );

                      resetVerification();
                    }}
                    placeholder={`Enter your ${game.id_label}`}
                    className="w-full rounded-2xl border border-white/10 bg-muted/40 px-3.5 py-3 text-sm outline-none placeholder:text-faint focus:border-violet/50 disabled:opacity-60"
                  />
                </div>


                {/* SID */}
                {game.requires_server_id ? (
                  <div>
                    <label
                      htmlFor="player-server"
                      className="mb-1.5 block text-[10px] uppercase tracking-[0.15em] text-faint"
                    >
                      {game.server_label}
                    </label>

                    <input
                      id="player-server"
                      value={
                        playerServer
                      }
                      disabled={
                        verifying
                      }
                      onChange={(
                        e,
                      ) => {
                        setPlayerServer(
                          e.target.value.slice(
                            0,
                            64,
                          ),
                        );

                        resetVerification();
                      }}
                      placeholder={`Enter your ${game.server_label}`}
                      className="w-full rounded-2xl border border-white/10 bg-muted/40 px-3.5 py-3 text-sm outline-none placeholder:text-faint focus:border-violet/50 disabled:opacity-60"
                    />
                  </div>
                ) : null}


                {/* HELP */}
                <p className="text-[11px] text-faint sm:col-span-2">
                  {game.id_help ??
                    `Double-check your ${game.id_label} — top-ups are delivered straight to this account.`}
                </p>


                {/* ERROR */}
                {verificationError ? (
                  <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-xs text-red-300 sm:col-span-2">
                    {
                      verificationError
                    }
                  </div>
                ) : null}


                {/* VERIFIED ACCOUNT */}
                {verified &&
                  nickname ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-lime/30 bg-lime/10 px-3 py-3 sm:col-span-2">

                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-lime/15">
                      <UserRoundCheck className="size-5 text-lime" />
                    </div>

                    <div className="min-w-0">

                      <p className="text-[10px] uppercase tracking-[0.14em] text-faint">
                        Verified account
                      </p>

                      <p className="truncate font-display text-sm font-semibold text-lime">
                        {
                          nickname
                        }
                      </p>

                      <p className="mt-0.5 text-[10px] text-faint">
                        UID:{" "}
                        {
                          verifiedUid
                        }

                        {verifiedSid
                          ? ` · SID: ${verifiedSid}`
                          : ""}
                      </p>

                    </div>

                    <BadgeCheck className="ml-auto size-5 shrink-0 text-lime" />

                  </div>
                ) : null}


                {/* VERIFY BUTTON */}
                <div className="sm:col-span-2">

                  <button
                    type="button"
                    onClick={
                      verifyId
                    }
                    disabled={
                      verifying ||
                      !playerRef.trim() ||
                      (game.requires_server_id &&
                        !playerServer.trim())
                    }
                    className={
                      verified
                        ? "inline-flex items-center gap-1.5 rounded-2xl border border-lime/40 bg-lime/10 px-4 py-2.5 font-display text-xs font-semibold text-lime transition hover:bg-lime/15 disabled:opacity-50"
                        : "inline-flex items-center gap-1.5 rounded-2xl border border-violet/50 bg-violet/10 px-4 py-2.5 font-display text-xs font-semibold text-violet transition hover:bg-violet/20 disabled:opacity-50"
                    }
                  >

                    {verifying ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Verifying…
                      </>
                    ) : verified ? (
                      <>
                        <BadgeCheck className="size-4" />
                        Verified
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="size-4" />
                        Verify ID
                      </>
                    )}

                  </button>

                </div>

              </div>

            </section>


            {/* ================================================= */}
            {/* PACKS */}
            {/* ================================================= */}

            <section>

              <p className="mb-2.5 font-display text-sm font-medium text-subtle">
                Choose a recharge pack
              </p>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">

                {packs.map(
                  (p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setSelected(
                          p.id,
                        )
                      }
                      className={
                        p.id ===
                          selected
                          ? "rounded-2xl border border-violet/60 bg-gradient-to-br from-violet/30 to-cyan/30 p-3 text-left"
                          : "glass-panel rounded-2xl p-3 text-left"
                      }
                    >

                      <p className="text-xs text-faint">
                        {
                          p.label
                        }
                      </p>

                      <p className="font-display text-base font-semibold">
                        {
                          money(
                            priceOf(
                              p,
                            ),
                          )
                        }
                      </p>

                      {percent >
                        0 ? (
                        <p className="text-[10px] text-faint line-through">
                          {
                            money(
                              listPriceOf(
                                p,
                              ),
                            )
                          }
                        </p>
                      ) : null}

                      {p.bonus_text ? (
                        <p className="text-[10px] font-medium text-lime">
                          {
                            p.bonus_text
                          }
                        </p>
                      ) : null}

                    </button>
                  ),
                )}

              </div>

              {packs.length ===
                0 ? (
                <p className="text-xs text-faint">
                  No recharge packs yet for this game.
                </p>
              ) : null}

            </section>

          </div>


          {/* ================================================= */}
          {/* ORDER SUMMARY */}
          {/* ================================================= */}

          <section className="lg:sticky lg:top-5">

            <div className="glass-panel rounded-3xl p-4">

              <p className="font-display text-sm font-medium text-subtle">
                Order summary
              </p>


              <div className="mt-3 flex items-center justify-between text-sm">

                <span className="text-subtle">
                  {
                    pack?.label ??
                    "Select a pack"
                  }
                </span>

                <span className="font-display font-semibold">
                  {pack
                    ? money(
                      priceOf(
                        pack,
                      ),
                    )
                    : "—"}
                </span>

              </div>


              {pack &&
                percent >
                0 ? (
                <p className="mt-1 text-[11px] text-lime">
                  {
                    percent
                  }% off applied · was{" "}
                  {
                    money(
                      listPriceOf(
                        pack,
                      ),
                    )
                  }
                </p>
              ) : null}


              {/* COUPON */}
              <div className="mt-3">

                {appliedCoupon ? (
                  <div className="flex items-center justify-between rounded-2xl border border-lime/30 bg-lime/10 px-3 py-2.5">

                    <span className="flex items-center gap-1.5 text-xs font-medium text-lime">
                      <TicketPercent className="size-3.5" />
                      {
                        appliedCoupon
                      }
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setAppliedCoupon(
                          null,
                        );

                        setCoupon(
                          "",
                        );
                      }}
                      className="text-[11px] text-faint underline-offset-2 hover:underline"
                    >
                      Remove
                    </button>

                  </div>
                ) : (
                  <div className="flex gap-2">

                    <input
                      value={
                        coupon
                      }
                      onChange={(
                        e,
                      ) =>
                        setCoupon(
                          e.target
                            .value,
                        )
                      }
                      placeholder="Add coupon code"
                      className="w-full rounded-2xl border border-white/10 bg-muted/40 px-3.5 py-2.5 text-sm uppercase outline-none placeholder:normal-case placeholder:text-faint focus:border-violet/50"
                    />

                    <button
                      type="button"
                      onClick={
                        applyCoupon
                      }
                      disabled={
                        !coupon.trim()
                      }
                      className="shrink-0 rounded-2xl border border-violet/50 bg-violet/10 px-4 py-2.5 font-display text-xs font-semibold text-violet transition hover:bg-violet/20 disabled:opacity-50"
                    >
                      Apply
                    </button>

                  </div>
                )}

              </div>


              {/* ================================================= */}
              {/* CHECKOUT */}
              {/* ================================================= */}

              {user ? (
                <button
                  type="button"
                  onClick={
                    checkout
                  }
                  disabled={
                    submitting ||
                    !pack ||
                    !verified
                  }
                  className="brand-gradient mt-4 w-full rounded-2xl py-3.5 font-display text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
                >

                  {submitting
                    ? "Placing order…"
                    : !verified
                      ? "Verify ID to continue"
                      : "Continue to checkout"}

                </button>
              ) : (
                <>
                  <Link
                    to="/auth"
                    search={{
                      redirect:
                        `/topup/${slug}`,
                    }}
                    className="brand-gradient mt-4 block w-full rounded-2xl py-3.5 text-center font-display text-sm font-semibold text-ink"
                    aria-disabled={
                      loading
                    }
                  >
                    Sign in to top up
                  </Link>

                  <p className="mt-2 text-center text-[11px] text-faint">
                    You need an account so we can deliver and track your order.
                  </p>
                </>
              )}


              <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-faint">
                <ShieldCheck className="size-3.5" />
                Instant delivery · Secured payments
              </p>

            </div>

          </section>

        </div>
      ) : (
        <p className="mt-8 px-4 text-sm text-subtle sm:px-6">
          {gamesLoading
            ? "Loading game…"
            : "This game is not available right now."}
        </p>
      )}

    </PageShell>
  );
}