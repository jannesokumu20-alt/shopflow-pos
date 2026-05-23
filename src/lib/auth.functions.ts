import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 7);

const registerSchema = z.object({
  owner_name: z.string().trim().min(2).max(80),
  shop_name: z.string().trim().min(2).max(80),
  phone: z.string().regex(/^07\d{8}$/, "Phone must be 07XXXXXXXX"),
  password: z.string().min(6).max(72),
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),
});

export const registerShop = createServerFn({ method: "POST" })
  .inputValidator((input) => registerSchema.parse(input))
  .handler(async ({ data }) => {
    const email = `${data.phone}@shoppos.app`;

    // Reject duplicate phone
    const { data: existing } = await supabaseAdmin
      .from("shops")
      .select("id")
      .eq("phone", data.phone)
      .maybeSingle();
    if (existing) {
      throw new Error("This phone number is already registered");
    }

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { phone: data.phone, shop_name: data.shop_name },
    });
    if (createErr || !created.user) {
      throw new Error(createErr?.message || "Could not create account");
    }

    const pin_hash = await bcrypt.hash(data.pin, 10);
    const trial_start = new Date();
    const subscription_expiry = new Date(trial_start.getTime() + TRIAL_DAYS * 86400000);

    const { error: shopErr } = await supabaseAdmin.from("shops").insert({
      user_id: created.user.id,
      owner_name: data.owner_name,
      shop_name: data.shop_name,
      phone: data.phone,
      pin_hash,
      trial_start: trial_start.toISOString(),
      subscription_expiry: subscription_expiry.toISOString(),
      subscription_status: "trial",
    });
    if (shopErr) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error(shopErr.message);
    }

    return { success: true, email };
  });

export const getMyShop = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("shops")
      .select("*")
      .eq("user_id", userId)
      .single();
    if (error || !data) throw new Error(error?.message || "Shop not found");

    const now = Date.now();
    const expiry = new Date(data.subscription_expiry).getTime();
    const days_remaining = Math.max(0, Math.ceil((expiry - now) / 86400000));
    const subscription_active = expiry > now;
    const pin_session_active = data.pin_valid_until ? new Date(data.pin_valid_until).getTime() > now : false;
    const needs_onboarding = !data.payhero_channel_id;

    return {
      id: data.id,
      owner_name: data.owner_name,
      shop_name: data.shop_name,
      phone: data.phone,
      till_number: data.till_number,
      till_type: data.till_type,
      subscription_status: data.subscription_status,
      subscription_expiry: data.subscription_expiry,
      days_remaining,
      subscription_active,
      pin_session_active,
      pin_valid_until: data.pin_valid_until,
      needs_onboarding,
    };
  });

const verifyPinSchema = z.object({ pin: z.string().regex(/^\d{4}$/) });

export const verifyPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => verifyPinSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { data: shop, error } = await supabaseAdmin
      .from("shops")
      .select("id, pin_hash, pin_failed_attempts, pin_locked_until")
      .eq("user_id", userId)
      .single();
    if (error || !shop) throw new Error("Shop not found");

    if (!shop.pin_hash) throw new Error("PIN not configured for this account");

    const now = Date.now();
    if (shop.pin_locked_until && new Date(shop.pin_locked_until).getTime() > now) {
      const mins = Math.ceil((new Date(shop.pin_locked_until).getTime() - now) / 60000);
      throw new Error(`PIN locked. Try again in ${mins} minutes.`);
    }

    const ok = await bcrypt.compare(data.pin, shop.pin_hash);
    if (!ok) {
      const attempts = (shop.pin_failed_attempts ?? 0) + 1;
      const lock = attempts >= 5;
      await supabaseAdmin
        .from("shops")
        .update({
          pin_failed_attempts: lock ? 0 : attempts,
          pin_locked_until: lock ? new Date(now + 15 * 60000).toISOString() : null,
        })
        .eq("id", shop.id);
      throw new Error(lock ? "Too many wrong attempts. Locked for 15 minutes." : "Wrong PIN");
    }

    const valid_until = new Date(now + 24 * 3600 * 1000).toISOString();
    await supabaseAdmin
      .from("shops")
      .update({
        pin_valid_until: valid_until,
        pin_failed_attempts: 0,
        pin_locked_until: null,
      })
      .eq("id", shop.id);

    return { valid: true, valid_until };
  });
