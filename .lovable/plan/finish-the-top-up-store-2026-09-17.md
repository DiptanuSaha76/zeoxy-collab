# Finish the top-up store

## 1. Home page shows games only

The home page keeps the rotating banners and the game grid, but the recharge
packages block is removed. Prices and packs only appear after the visitor taps a
game and lands on that game's top-up page.

The game list becomes a responsive grid: two columns on a phone, three to five
across on tablet and desktop, instead of the current sideways scrolling strip.

## 2. Sign-in required to top up

On a game page a signed-out visitor can browse packs and prices, but the
checkout button is replaced by a "Sign in to top up" button that takes them to
the sign-in page and returns them to the same game afterwards. No more silent
failure or lost selection.

The header shows the signed-in state (account menu with Orders / Admin / sign  
out) instead of a plain sign-in icon.

## 3. Player ID verification per game

Some games (Mobile Legends style) need a numeric UID plus a server/zone ID;
others just need a username. Each game gets its own rules, set by the admin:

- what the ID field is called (e.g. "Mobile Legends UID")
- whether a second server/zone field is required, and its label
- allowed format: numbers only or free text, with a minimum and maximum length
- a short help note shown under the field

The top-up page validates the entry against those rules before checkout and
shows a clear message when it doesn't match. The entered ID and server are saved
with the order and shown on the order list and in the admin order view.

## 4. Orders page

A signed-in customer gets an orders page listing their top-ups with game name,
pack, player ID, amount, status and date. Reachable from the header.

## 5. Admin panel

Admin-only area with tabs, working on phone and desktop:

- **Games** — add, edit, activate/deactivate, reorder; set cover image URL,
category, currency name and the ID verification rules above.
- **Packages** — pick a game, then add/edit/remove its recharge packs (label,
amount, price, bonus text, popular flag, active flag, order).
- **Banners** — add/edit banners with title, subtitle, badge, image URL and the
game they link to.
- **Orders** — all customer orders with player ID and server, and a status
control (pending / processing / completed / failed).
- **Admins** — list current admin accounts, grant admin to an account by email,
and revoke it. If the email hasn't signed up yet it is stored as a pending
invite and the account becomes admin automatically on first sign-in. The
admin area cannot be reached by anyone without the admin role, checked on the
server.

## 6. Responsive across devices

Everything gets a phone-first layout that widens properly on desktop: capped
content width and centred layout, multi-column game/pack grids, banner that
scales instead of stretching, tables that turn into cards on small screens.

## Technical notes

- Database migration: add `id_kind` (numeric/text), `id_min_len`, `id_max_len`,
`id_help`, `requires_server_id`, `server_label` to `games`; add
`player_server` to `orders`; add `admin_invites` (email, created_by) with a
grant on the existing signup trigger; keep RLS admin-only on invites.
- Admin membership changes and the invite lookup run through
`createServerFn` with `requireSupabaseAuth`, re-checking `has_role(admin)`
server-side before using the privileged client; email lookup uses the Auth
admin API.
- New routes: `src/routes/_authenticated/route.tsx` gate,
`_authenticated/orders.tsx`, `_authenticated/admin.tsx`; `/topup/$slug` and
`/` stay public and SSR-rendered for sharing.
- Shared `PageShell` component for the capped-width responsive layout used by
every page.