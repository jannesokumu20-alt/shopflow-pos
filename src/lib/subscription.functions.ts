import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendStkPush, normalizeKenyanPhone } from "./payhero.server";

export const paySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const amountStr = process.env.SUBSCRIPTION_AMOUNT || "499";
    const amount = Number(amountStr);
    if (Number.isNaN(amount) || amount <= 0) throw new Error("Invalid SUBSCRIPTION_AMOUNT");
    const platformChannelId = Number(process.env.PAYHERO_PLATFORM_CHANNEL_ID);
    if (Number.isNaN(platformChannelId)) throw new Error("Platform channel not configured");

    const { data: shop, error } = await supabaseAdmin
      .from("shops")
      .select("id, phone, shop_name")
      .eq("user_id", userId)
      .single();
    if (error || !shop) throw new Error("Shop not found");

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("subscription_payments")
      .insert({ shop_id: shop.id, amount, payment_status: "pending" })
      .select()
      .single();
    if (subErr || !sub) throw new Error(subErr?.message || "Could not create payment");

    try {
      const stk = await sendStkPush({
        amount,
        phone_number: normalizeKenyanPhone(shop.phone),
        channel_id: platformChannelId,
        external_reference: `SUB-${sub.id}`,
        customer_name: shop.shop_name,
      });
      await supabaseAdmin
        .from("subscription_payments")
        .update({
          payhero_reference: stk.reference ?? null,
          payhero_checkout_request_id: stk.checkout_request_id ?? null,
        })
        .eq("id", sub.id);
    } catch (e) {
      await supabaseAdmin
        .from("subscription_payments")
        .update({ payment_status: "failed" })
        .eq("id", sub.id);
      throw e instanceof Error ? e : new Error(String(e));
    }

    return { subscription_payment_id: sub.id, amount };
  });

const statusSchema = z.object({ id: z.string().uuid() });

export const getSubscriptionPaymentStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => statusSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("subscription_payments")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error("Not found");
    return { payment: row };
  });
