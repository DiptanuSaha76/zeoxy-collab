import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { PageShell } from "@/components/PageShell";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const initialPath = useRef(pathname);
  const sent = useRef(false);

  useEffect(() => {
    if (loading || user || sent.current) return;
    if (initialPath.current.startsWith("/auth")) return;
    sent.current = true;
    navigate({ to: "/auth", search: { redirect: initialPath.current }, replace: true });
  }, [loading, user, navigate]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <p className="text-sm text-faint">Loading…</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <PageShell width="wide">
      <Outlet />
    </PageShell>
  );
}
