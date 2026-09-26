import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listContactMessages,
  updateContactMessageStatus,
} from "@/lib/admin.functions";

type ContactMessage = {
  id: string;
  name: string;
  email: string;
  order_number: string | null;
  message: string;
  status: "new" | "read" | "resolved";
  created_at: string;
  read_at: string | null;
  resolved_at: string | null;
};

const btn = "glass-panel rounded-xl px-3 py-2 text-xs font-medium";

const statusClasses: Record<ContactMessage["status"], string> = {
  new: "border-amber/30 bg-amber/10 text-amber",
  read: "border-cyan/30 bg-cyan/10 text-cyan",
  resolved: "border-lime/30 bg-lime/10 text-lime",
};

export function ContactMessagesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listContactMessages);
  const updateFn = useServerFn(updateContactMessageStatus);

  const query = useQuery({
    queryKey: ["contact-messages"],
    queryFn: async () => (await listFn({})) as ContactMessage[],
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  async function setStatus(
    message: ContactMessage,
    status: ContactMessage["status"],
  ) {
    try {
      await updateFn({ data: { id: message.id, status } });
      toast.success("Message status updated");
      await qc.invalidateQueries({ queryKey: ["contact-messages"] });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update message",
      );
    }
  }

  if (query.isLoading) {
    return (
      <div className="glass-panel rounded-2xl p-4">
        <p className="text-sm text-faint">Loading contact messages…</p>
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="glass-panel rounded-2xl p-4">
        <p className="text-sm text-rose">
          Could not load contact messages:{" "}
          {query.error instanceof Error
            ? query.error.message
            : "Unknown error"}
        </p>
      </div>
    );
  }

  const messages = query.data ?? [];
  const unread = messages.filter((m) => m.status === "new").length;

  if (!messages.length) {
    return (
      <div className="glass-panel rounded-2xl p-4">
        <p className="text-sm text-faint">No contact messages yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-sm font-semibold">
            Contact messages
          </p>
          <p className="mt-1 text-[11px] text-faint">
            Support requests submitted from Contact Us.
          </p>
        </div>
        <p className="text-[11px] text-faint">
          {unread} new · {messages.length} total
        </p>
      </div>

      {messages.map((m) => (
        <div key={m.id} className="glass-panel rounded-2xl p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-sm font-semibold">{m.name}</p>
                <span
                  className={`rounded-full border px-2 py-1 text-[10px] capitalize ${statusClasses[m.status]}`}
                >
                  {m.status}
                </span>
              </div>
              <p className="mt-1 break-all text-[11px] text-cyan">{m.email}</p>
              <p className="mt-1 text-[10px] text-faint">
                {m.order_number ? `Order: ${m.order_number} · ` : ""}
                {new Date(m.created_at).toLocaleString()}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              {m.status === "new" ? (
                <button
                  type="button"
                  className={btn}
                  onClick={() => void setStatus(m, "read")}
                >
                  Mark read
                </button>
              ) : null}

              {m.status !== "resolved" ? (
                <button
                  type="button"
                  className={`${btn} border-lime/30 text-lime`}
                  onClick={() => void setStatus(m, "resolved")}
                >
                  Resolve
                </button>
              ) : (
                <button
                  type="button"
                  className={btn}
                  onClick={() => void setStatus(m, "new")}
                >
                  Reopen
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {m.message}
            </p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <a
              className="glass-panel rounded-xl px-3 py-2 text-xs font-medium"
              href={`mailto:${m.email}`}
            >
              Reply by email
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
