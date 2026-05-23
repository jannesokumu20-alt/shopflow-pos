import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { registerShop } from "@/lib/auth.functions";
import { isValidKenyanPhone, phoneToEmail } from "@/lib/phone";

export const Route = createFileRoute("/register")({ component: RegisterPage });

function RegisterPage() {
  const navigate = useNavigate();
  const register = useServerFn(registerShop);
  const [owner_name, setOwnerName] = useState("");
  const [shop_name, setShopName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidKenyanPhone(phone)) { toast.error("Phone must be 07XXXXXXXX"); return; }
    if (password.length < 6) { toast.error("Password must be at least 6 chars"); return; }
    if (!/^\d{4}$/.test(pin)) { toast.error("PIN must be 4 digits"); return; }
    setLoading(true);
    try {
      await register({ data: { owner_name, shop_name, phone, password, pin } });
      const { error } = await supabase.auth.signInWithPassword({
        email: phoneToEmail(phone),
        password,
      });
      if (error) throw error;
      toast.success("Account created. Welcome!");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err?.message || "Could not register");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your shop account</CardTitle>
          <CardDescription>7-day free trial. No card required.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="owner">Your name</Label><Input id="owner" value={owner_name} onChange={(e) => setOwnerName(e.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="shop">Shop name</Label><Input id="shop" value={shop_name} onChange={(e) => setShopName(e.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="phone">Phone</Label><Input id="phone" inputMode="numeric" placeholder="07XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={10} required /></div>
            <div className="space-y-2"><Label htmlFor="password">Password (min 6)</Label><Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="pin">4-digit PIN (used to confirm sales)</Label><Input id="pin" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} required /></div>
            <Button type="submit" disabled={loading} className="w-full">{loading ? "Creating..." : "Create account"}</Button>
            <p className="text-sm text-center text-muted-foreground">Have an account? <Link to="/login" className="text-primary underline">Login</Link></p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}