import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { registerPaymentChannel } from "./payhero.server";

const onboardSchema = z.object({
  till_type: z.enum(["paybill", "till", "bank"]),
  till_number: z.string().trim().min(3).max(20).regex(/^\d+$/, "Digits only"),
  account_number: z.string().trim().max(40).optional(),
});

export const onboardTill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => onboardSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { data: shop, error } = await supabaseAdmin
      .from("shops")
      .select("id, shop_name")
      .eq("user_id", userId)
      .single();
    if (error || !shop) throw new Error("Shop not found");

    const result = await registerPaymentChannel({
      channel_type: data.till_type,
      short_code: data.till_number,
      account_number: data.account_number,
      name: shop.shop_name,
    });

    const { error: updErr } = await supabaseAdmin
      .from("shops")
      .update({
        payhero_channel_id: result.channel_id,
        till_number: data.till_number,
        till_type: data.till_type,
      })
      .eq("id", shop.id);
    if (updErr) throw new Error(updErr.message);

    return { success: true, channel_id: result.channel_id };
  });