import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const submitContactSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  orderNumber: z.string().trim().max(80).optional().default(""),
  message: z.string().trim().min(5).max(4000),
});

export const submitContactMessage = createServerFn({ method: "POST" })
  .inputValidator((data) => submitContactSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");

    const { data: row, error } = await (supabaseAdmin as any)
      .from("contact_messages")
      .insert({
        name: data.name,
        email: data.email.toLowerCase(),
        order_number: data.orderNumber || null,
        message: data.message,
        status: "new",
      })
      .select("id")
      .single();

    if (error) {
      console.error("[Contact] Failed to store message:", error);
      throw new Error("Could not send your message");
    }

    return { ok: true, id: row.id };
  });