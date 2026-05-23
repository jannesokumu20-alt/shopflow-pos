import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * PayHero webhook handler.
 * Accepts the callback POST and updates the matching sale or subscription_payment.
 * On success: marks sale as paid + decrements product stock, or extends subscription.
 */
export const Route = createFileRoute("/api/public/webhooks/payhero")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: any;
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const r = payload?.response ?? payload?.data ?? payload ?? {};
        const externalRef: string =
          r.ExternalReference ?? r.external_reference ?? payload.external_reference ?? "";
        const statusRaw: string = (r.Status ?? r.status ?? "").toString().toLowerCase();
        const resultCode = r.ResultCode ?? r.result_code;
        const success =
          statusRaw === "success" ||
          statusRaw === "completed" ||
          statusRaw === "paid" ||
          resultCode === 0 ||
          resultCode === "0";
        const newStatus: "paid" | "failed" = success ? "paid" : "failed";
        const mpesaReceipt: string | null =
          r.MpesaReceiptNumber ?? r.mpesa_receipt_number ?? r.receipt ?? null;

        if (!externalRef) {
          console.error("[payhero-webhook] missing external_reference", payload);
          return new Response("ok");
        }

        try {
          if (externalRef.startsWith("SALE-")) {
            const saleId = externalRef.slice("SALE-".length);
            const { data: sale } = await supabaseAdmin
              .from("sales")
              .select("id, payment_status, shop_id")
              .eq("id", saleId)
              .maybeSingle();
            if (!sale) return new Response("ok");
            if (sale.payment_status !== "pending") return new Response("ok"); // idempotent

            await supabaseAdmin
              .from("sales")
              .update({
                payment_status: newStatus,
                payhero_reference: mpesaReceipt ?? undefined,
              })
              .eq("id", saleId);

            if (success) {
              const { data: items } = await supabaseAdmin
                .from("sale_items")
                .select("product_id, quantity")
                .eq("sale_id", saleId);
              for (const it of items ?? []) {
                if (!it.product_id) continue;
                const { data: prod } = await supabaseAdmin
                  .from("products")
                  .select("stock")
                  .eq("id", it.product_id)
                  .maybeSingle();
                if (prod) {
                  await supabaseAdmin
                    .from("products")
                    .update({ stock: Math.max(0, prod.stock - it.quantity) })
                    .eq("id", it.product_id);
                }
              }
            }
          } else if (externalRef.startsWith("SUB-")) {
            const subId = externalRef.slice("SUB-".length);
            const { data: sub } = await supabaseAdmin
              .from("subscription_payments")
              .select("id, payment_status, shop_id, amount")
              .eq("id", subId)
              .maybeSingle();
            if (!sub) return new Response("ok");
            if (sub.payment_status !== "pending") return new Response("ok");

            await supabaseAdmin
              .from("subscription_payments")
              .update({
                payment_status: newStatus,
                payhero_reference: mpesaReceipt ?? undefined,
              })
              .eq("id", subId);

            if (success) {
              const { data: shop } = await supabaseAdmin
                .from("shops")
                .select("subscription_expiry")
                .eq("id", sub.shop_id)
                .single();
              const base = shop?.subscription_expiry
                ? Math.max(Date.now(), new Date(shop.subscription_expiry).getTime())
                : Date.now();
              const newExpiry = new Date(base + 30 * 86400000).toISOString();
              await supabaseAdmin
                .from("shops")
                .update({
                  subscription_expiry: newExpiry,
                  subscription_status: "active",
                })
                .eq("id", sub.shop_id);
            }
          }
        } catch (e) {
          console.error("[payhero-webhook] processing error", e);
        }

        return new Response("ok");
      },
      GET: async () => new Response("ok"),
    },
  },
});