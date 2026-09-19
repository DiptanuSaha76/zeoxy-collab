import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";

const LINKS = [
  { to: "/", label: "Home" },
  { to: "/how-it-works", label: "How It Works" },
  { to: "/about", label: "About Us" },
  { to: "/contact", label: "Contact Us" },
] as const;

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  actions?: ReactNode;
};

export function useMobileMenu() {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  // Lock body scroll while menu is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close menu with Escape
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return {
    open,
    setOpen,
    close,
  };
}

export function HamburgerButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Open menu"
      aria-haspopup="dialog"
      onClick={onClick}
      className="flex h-9 w-9 flex-col items-center justify-center gap-[5px] rounded-xl border border-white/10 bg-white/5 text-subtle transition-all hover:bg-white/10 hover:text-white active:scale-95 sm:hidden"
    >
      <span className="h-[2px] w-4 rounded-full bg-current" />
      <span className="h-[2px] w-4 rounded-full bg-current" />
      <span className="h-[2px] w-4 rounded-full bg-current" />
    </button>
  );
}

export function MobileDrawer({ open, onClose, actions }: DrawerProps) {
  const navigate = useNavigate();

  // Navigate + close
  const go = (to: string) => {
    onClose();
    navigate({ to });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 sm:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col border-r border-black/10 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out sm:hidden dark:border-white/10 dark:bg-[#0b0f14]/90 ${
          open ? "translate-x-0" : "-translate-x-full"
        } bg-background/95`}
      >
        {/* Header: logo + close */}
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-4 dark:border-white/10">
          <Link to="/" onClick={onClose} className="flex items-center gap-2">
            <div className="brand-gradient grid size-9 place-items-center rounded-xl font-display font-bold text-ink">
              R
            </div>
            <div>
              <p className="font-display text-base font-semibold leading-none tracking-tight text-ink">
                Recharge
              </p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-faint">
                Instant Top-Up
              </p>
            </div>
          </Link>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="glass-panel flex h-8 w-8 items-center justify-center rounded-lg text-faint transition-colors hover:text-ink"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path
                d="M1 1l12 12M13 1L1 13"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <p className="mb-2 px-2 text-[10px] uppercase tracking-[0.2em] text-faint">
            Menu
          </p>
          <ul className="space-y-1">
            {LINKS.map((l) => (
              <li key={l.to}>
                <button
                  type="button"
                  onClick={() => go(l.to)}
                  className="w-full rounded-xl px-3 py-3 text-left font-display text-sm font-medium text-subtle transition-colors hover:bg-black/5 hover:text-ink active:bg-black/10 dark:hover:bg-white/5 dark:hover:text-white dark:active:bg-white/10"
                >
                  {l.label}
                </button>
              </li>
            ))}
          </ul>

          {actions && (
            <div className="mt-4 space-y-2 border-t border-black/10 px-1 pt-4 dark:border-white/10">
              {actions}
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-black/10 px-4 py-4 dark:border-white/10">
          <p className="text-[10px] text-faint">© 2026 Recharge</p>
        </div>
      </aside>
    </>
  );
}



