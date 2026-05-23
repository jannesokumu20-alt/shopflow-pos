import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { onboardTill } from "@/lib/onboarding.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/onboarding")({ component: OnboardingPage });

function OnboardingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const onboard = useServerFn(onboardTill);
  const [till_type, setTillType] = useState<"till" | "paybill" | "bank">("till");
  const [till_number, setTillNumber] = useState("");
  const [account_number, setAccountNumber] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d+$/.test(till_number)) { toast.error("Numbers only"); return; }
    setLoading(true);
    try {
      await onboard({ data: { till_type, till_number, account_number: account_number || undefined } });
      await qc.invalidateQueries({ queryKey: ["my-shop"] });
      toast.success("Payment details saved");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err?.message || "Could not save payment details");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Set up payments</CardTitle>
          <CardDescription>Enter your M-Pesa Till, Paybill, or Bank details. Customer payments will be sent here.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Payment method</Label>
              <Select value={till_type} onValueChange={(v) => setTillType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="till">M-Pesa Till (Buy Goods)</SelectItem>
                  <SelectItem value="paybill">M-Pesa Paybill</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="num">{till_type === "till" ? "Till number" : till_type === "paybill" ? "Paybill number" : "Bank short code"}</Label>
              <Input id="num" inputMode="numeric" value={till_number} onChange={(e) => setTillNumber(e.target.value.replace(/\D/g, ""))} required />
            </div>
            {till_type !== "till" && (
              <div className="space-y-2">
                <Label htmlFor="acc">Account number {till_type === "paybill" ? "(required)" : "(optional)"}</Label>
                <Input id="acc" value={account_number} onChange={(e) => setAccountNumber(e.target.value)} required={till_type === "paybill"} />
              </div>
            )}
            <Button type="submit" disabled={loading} className="w-full">{loading ? "Saving..." : "Save & continue"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}