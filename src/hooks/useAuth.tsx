import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkedFor, setCheckedFor] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const user: User | null = session?.user ?? null;
  const userId = user?.id ?? null;

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      setIsAdmin(false);
      setCheckedFor(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      await supabase.rpc("ensure_profile");
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      if (!cancelled) {
        setIsAdmin(Boolean(data));
        setCheckedFor(userId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, loading]);

  const roleLoading = checkedFor !== userId;

  return { session, user, isAdmin, loading, roleLoading, ready: !loading && !roleLoading };
}
