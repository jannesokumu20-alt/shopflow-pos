import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendStkPush, normalizeKenyanPhone } from "./payhero.server";

const createSaleSchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(10_000),
      }),
    )
    .min(1)
    .max(100),
  customer_phone: z.string().regex(/^07\d{8}$/, "Phone must be 07XXXXXXXX"),
});

export const createSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSaleSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { userId } = context;

    const { data: shop, error: shopErr } = await supabaseAdmin
      .from("shops")
      .select("id, payhero_channel_id, pin_valid_until, subscription_expiry, shop_name")
      .eq("user_id", userId)
      .single();
    if (shopErr || !shop) throw new Error("Shop not found");

    const now = Date.now();
    if (new Date(shop.subscription_expiry).getTime() <= now) {
      throw new Error("SUBSCRIPTION_EXPIRED");
    }
    if (!shop.pin_valid_until || new Date(shop.pin_valid_until).getTime() <= now) {
      throw new Error("PIN_EXPIRED");
    }
    if (!shop.payhero_channel_id) {
      throw new Error("Till not registered. Complete onboarding first.");
    }

    const ids = data.items.map((i) => i.product_id);
    const { data: products, error: prodErr } = await supabaseAdmin
      .from("products")
      .select("id, name, price, stock")
      .eq("shop_id", shop.id)
      .in("id", ids);
    if (prodErr) throw new Error(prodErr.message);
    if (!products || products.length !== ids.length) {
      throw new Error("One or more products not found");
    }

    let total = 0;
    const lines = data.items.map((it) => {
      const p = products.find((x) => x.id === it.product_id)!;
      if (it.quantity > p.stock) {
        throw new Error(`Not enough stock for ${p.name} (only ${p.stock} left)`);
      }
      const unit = Number(p.price);
      const line_total = unit * it.quantity;
      total += line_total;
      return {
        product_id: p.id,
        product_name: p.name,
        quantity: it.quantity,
        unit_price: unit,
        line_total,
      };
    });

    if (total <= 0) throw new Error("Total must be greater than zero");

    const { data: sale, error: saleErr } = await supabaseAdmin
      .from("sales")
      .insert({
        shop_id: shop.id,
        total_amount: total,
        customer_phone: data.customer_phone,
        payment_status: "pending",
      })
      .select()
      .single();
    if (saleErr || !sale) throw new Error(saleErr?.message || "Could not create sale");

    const { error: itemsErr } = await supabaseAdmin
      .from("sale_items")
      .insert(lines.map((l) => ({ ...l, sale_id: sale.id })));
    if (itemsErr) {
      await supabaseAdmin.from("sales").delete().eq("id", sale.id);
      throw new Error(itemsErr.message);
    }

    try {
      const stk = await sendStkPush({
        amount: total,
        phone_number: normalizeKenyanPhone(data.customer_phone),
        channel_id: shop.payhero_channel_id,
        external_reference: `SALE-${sale.id}`,
        customer_name: shop.shop_name,
      });
      await supabaseAdmin
        .from("sales")
        .update({
          payhero_reference: stk.reference ?? null,
          payhero_checkout_request_id: stk.checkout_request_id ?? null,
        })
        .eq("id", sale.id);
    } catch (e) {
      await supabaseAdmin
        .from("sales")
        .update({ payment_status: "failed" })
        .eq("id", sale.id);
      throw e instanceof Error ? e : new Error(String(e));
    }

    return { sale_id: sale.id, total_amount: total, status: "pending" as const };
  });

const statusSchema = z.object({ sale_id: z.string().uuid() });

export const getSaleStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => statusSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: sale, error } = await supabase
      .from("sales")
      .select("id, total_amount, customer_phone, payment_status, payhero_reference, sold_at")
      .eq("id", data.sale_id)
      .single();
    if (error || !sale) throw new Error("Sale not found");
    const { data: items } = await supabase
      .from("sale_items")
      .select("product_name, quantity, unit_price, line_total")
      .eq("sale_id", sale.id);
    return { sale, items: items ?? [] };
  });

const historySchema = z.object({
  period: z.enum(["today", "yesterday", "week", "month", "all"]).default("today"),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export const listSalesHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => historySchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;
    if (data.period === "today") {
      start = new Date(now); start.setHours(0, 0, 0, 0);
    } else if (data.period === "yesterday") {
      start = new Date(now); start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
      end = new Date(now); end.setHours(0, 0, 0, 0);
    } else if (data.period === "week") {
      start = new Date(now); start.setDate(start.getDate() - 7);
    } else if (data.period === "month") {
      start = new Date(now); start.setMonth(start.getMonth() - 1);
    }
    const from = (data.page - 1) * data.limit;
    const to = from + data.limit - 1;
    let q = supabase
      .from("sales")
      .select("id, total_amount, customer_phone, payment_status, payhero_reference, sold_at, sale_items(product_name,quantity,unit_price,line_total)")
      .order("sold_at", { ascending: false })
      .range(from, to);
    if (start) q = q.gte("sold_at", start.toISOString());
    if (end) q = q.lt("sold_at", end.toISOString());
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { sales: rows ?? [] };
  });