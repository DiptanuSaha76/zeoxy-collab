import { Link, useNavigate } from "@tanstack/react-router";
import { Moon, Sun, ShieldCheck, LogOut, LogIn, Receipt } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { HamburgerButton } from "@/components/MobileMenu";

export function SiteHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const { theme, toggle } = useTheme();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="relative z-10 flex items-center justify-between gap-3 px-4 pt-5 sm:px-6">
      <div className="flex items-center gap-2">
        {/* Hamburger — mobile only */}
        <HamburgerButton onClick={onMenuClick} />
        <Link to="/" className="flex items-center gap-2">
          <div className="brand-gradient grid size-9 place-items-center rounded-xl font-display font-bold text-ink">
            R
          </div>
          <div>
            <p className="font-display text-base font-semibold leading-none tracking-tight">Recharge</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-faint">Instant Top-Up</p>
          </div>
        </Link>
      </div>

      <div className="flex items-center gap-2">
        {/* ...everything below is exactly your existing code... */}
        <Link
          to="/how-it-works"
          className="glass-panel hidden items-center rounded-xl px-3 py-2 text-xs text-subtle sm:flex"
        >
          How It Works
        </Link>
        <Link
          to="/contact"
          className="glass-panel hidden items-center rounded-xl px-3 py-2 text-xs text-subtle sm:flex"
        >
          Contact Us
        </Link>
        <Link
          to="/about"
          className="glass-panel hidden items-center rounded-xl px-3 py-2 text-xs text-subtle sm:flex"
        >
          About Us
        </Link>
        {user ? (
          <Link
            to="/orders"
            className="glass-panel hidden items-center gap-2 rounded-xl px-3 py-2 text-xs text-subtle sm:flex"
          >
            <Receipt className="size-4" /> Orders
          </Link>
        ) : null}
        {user ? (
          <Link
            to="/orders"
            aria-label="My orders"
            className="glass-panel grid size-10 place-items-center rounded-xl text-subtle sm:hidden"
          >
            <Receipt className="size-4" />
          </Link>
        ) : null}
        {isAdmin ? (
          <Link
            to="/admin"
            className="glass-panel grid size-10 place-items-center rounded-xl text-cyan sm:w-auto sm:gap-2 sm:px-3"
            aria-label="Admin panel"
          >
            <ShieldCheck className="size-4" />
            <span className="hidden text-xs sm:inline">Admin</span>
          </Link>
        ) : null}
        {user ? (
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="glass-panel grid size-10 place-items-center rounded-xl text-subtle"
          >
            <LogOut className="size-4" />
          </button>
        ) : (
          <Link
            to="/auth"
            aria-label="Sign in"
            className="glass grid size-10 place-items-center rounded-xl text-subtle sm:w-auto sm:gap-2 sm:px-3"
          >
            <LogIn className="size-4" />
            <span className="hidden text-xs sm:inline">Sign in</span>
          </Link>
        )}
        <button
          onClick={toggle}
          aria-label="Toggle theme"
          className="glass-panel grid size-10 place-items-center rounded-xl text-subtle"
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const { isAdmin } = useAuth();
  return (
    <footer className="relative z-10 mb-6 mt-8 flex items-center justify-between px-4 sm:px-6">
      <p className="text-[11px] text-faint">© 2026 Recharge</p>
      <div className="flex gap-3">
        <Link to="/orders" className="text-[11px] text-subtle">
          Orders
        </Link>
        <Link to={isAdmin ? "/admin" : "/auth"} className="text-[11px] text-subtle">
          Admin
        </Link>
      </div>
    </footer>
  );
}

