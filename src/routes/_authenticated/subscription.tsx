import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyShop } from "@/lib/auth.functions";
import { paySubscription, getSubscriptionPaymentStatus } from "@/lib/subscription.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/subscription")({ component: SubscriptionPage });

function SubscriptionPage() {
  const qc = useQueryClient();
  const fetchShop = useServerFn(getMyShop);
  const pay = useServerFn(paySubscription);
  const status = useServerFn(getSubscriptionPaymentStatus);
  const shopQ = useQuery({ queryKey: ["my-shop"], queryFn: () => fetchShop() });
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const statusQ = useQuery({
    queryKey: ["sub-payment", paymentId],
    queryFn: () => status({ data: { id: paymentId! } }),
    enabled: !!paymentId,
    refetchInterval: (q) => {
      const s = q.state.data?.payment?.payment_status;
      return s && s !== "pending" ? false : 3000;
    },
  });

  useEffect(() => {
    const s = statusQ.data?.payment?.payment_status;
    if (s === "completed") {
      toast.success("Subscription renewed!");
      qc.invalidateQueries({ queryKey: ["my-shop"] });
      setPaymentId(null);
    } else if (s === "failed" || s === "cancelled") {
      toast.error("Payment failed");
    }
  }, [statusQ.data?.payment?.payment_status, qc]);

  async function onPay() {
    setLoading(true);
    try {
      const r = await pay();
      setPaymentId(r.subscription_payment_id);
      toast.success("STK push sent to your phone");
    } catch (err: any) { toast.error(err?.message || "Could not start payment"); }
    finally { setLoading(false); }
  }

  if (shopQ.isLoading) return <Loader2 className="animate-spin mx-auto" />;
  const shop = shopQ.data!;
  const payStatus = statusQ.data?.payment?.payment_status;

  return (
    <div className="max-w-md mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>{shop.subscription_status === "trial" ? "Free trial" : shop.subscription_status === "active" ? "Active" : "Expired"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">Expires: <span className="font-medium">{new Date(shop.subscription_expiry).toLocaleDateString()}</span></div>
          <div className="text-sm">{shop.days_remaining} day{shop.days_remaining === 1 ? "" : "s"} remaining</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Renew for Ksh 499</CardTitle>
          <CardDescription>Adds 30 days. You'll receive an M-Pesa prompt on {shop.phone}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {paymentId && payStatus === "pending" ? (
            <div className="text-center py-4 space-y-2">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
              <p className="text-sm">Check your phone and enter your M-Pesa PIN.</p>
            </div>
          ) : paymentId && payStatus === "completed" ? (
            <div className="text-center py-4 space-y-2">
              <CheckCircle2 className="w-10 h-10 mx-auto text-success" />
              <p>Renewed successfully!</p>
            </div>
          ) : paymentId && (payStatus === "failed" || payStatus === "cancelled") ? (
            <div className="text-center py-4 space-y-2">
              <XCircle className="w-10 h-10 mx-auto text-destructive" />
              <Button onClick={() => setPaymentId(null)} variant="outline" className="w-full">Try again</Button>
            </div>
          ) : (
            <Button onClick={onPay} disabled={loading} className="w-full h-12 text-lg">
              {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
              Pay Ksh 499
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}