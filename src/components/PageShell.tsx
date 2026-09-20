import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Moon, Sun, ShieldCheck, LogOut, LogIn, Receipt } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Aurora } from "@/components/Aurora";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { MobileDrawer, useMobileMenu } from "@/components/MobileMenu";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export function PageShell({
  children,
  width = "wide",
}: {
  children: ReactNode;
  width?: "wide" | "narrow";
}) {
  const { open, setOpen, close } = useMobileMenu();
  const { theme, toggle } = useTheme();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    close();
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden font-body">
      <Aurora />

      <MobileDrawer
        open={open}
        onClose={close}
        actions={
          <>
            <button
              onClick={toggle}
              className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left font-display text-sm font-medium text-subtle"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            {user ? (
              <Link
                to="/orders"
                onClick={close}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 font-display text-sm font-medium text-subtle"
              >
                <Receipt className="size-4" /> My Orders
              </Link>
            ) : (
              <Link
                to="/auth"
                onClick={close}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 font-display text-sm font-medium text-subtle"
              >
                <LogIn className="size-4" /> Sign in
              </Link>
            )}
            {isAdmin ? (
              <Link
                to="/admin"
                onClick={close}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 font-display text-sm font-medium text-cyan"
              >
                <ShieldCheck className="size-4" /> Admin panel
              </Link>
            ) : null}
            {user ? (
              <button
                onClick={signOut}
                className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 font-display text-sm font-medium text-subtle"
              >
                <LogOut className="size-4" /> Sign out
              </button>
            ) : null}
          </>
        }
      />

      <div
        className={
          width === "narrow"
            ? "relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col"
            : "relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col"
        }
      >
        <SiteHeader onMenuClick={() => setOpen(true)} />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}
