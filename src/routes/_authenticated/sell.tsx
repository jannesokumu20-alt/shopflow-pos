import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProducts } from "@/lib/products.functions";
import { createSale, getSaleStatus } from "@/lib/sales.functions";
import { verifyPin, getMyShop } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Minus, Trash2, Loader2, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sell")({ component: SellPage });

type CartItem = { product_id: string; name: string; price: number; quantity: number; stock: number };

function SellPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchProducts = useServerFn(listProducts);
  const fetchShop = useServerFn(getMyShop);
  const submitSale = useServerFn(createSale);
  const checkStatus = useServerFn(getSaleStatus);
  const submitPin = useServerFn(verifyPin);

  const products = useQuery({ queryKey: ["products"], queryFn: () => fetchProducts() });
  const shopQ = useQuery({ queryKey: ["my-shop"], queryFn: () => fetchShop() });

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer_phone, setCustomerPhone] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [paying, setPaying] = useState(false);
  const [activeSaleId, setActiveSaleId] = useState<string | null>(null);

  const total = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart]);

  function addToCart(p: any) {
    setCart((c) => {
      const existing = c.find((x) => x.product_id === p.id);
      if (existing) {
        if (existing.quantity >= p.stock) { toast.error("No more stock"); return c; }
        return c.map((x) => x.product_id === p.id ? { ...x, quantity: x.quantity + 1 } : x);
      }
      if (p.stock <= 0) { toast.error("Out of stock"); return c; }
      return [...c, { product_id: p.id, name: p.name, price: Number(p.price), quantity: 1, stock: p.stock }];
    });
  }

  function setQty(id: string, delta: number) {
    setCart((c) => c.flatMap((x) => {
      if (x.product_id !== id) return [x];
      const q = x.quantity + delta;
      if (q <= 0) return [];
      if (q > x.stock) { toast.error("No more stock"); return [x]; }
      return [{ ...x, quantity: q }];
    }));
  }

  async function startCheckout() {
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    if (!/^07\d{8}$/.test(customer_phone)) { toast.error("Phone must be 07XXXXXXXX"); return; }
    if (!shopQ.data?.pin_session_active) {
      setPinOpen(true);
      return;
    }
    await doCharge();
  }

  async function confirmPin() {
    if (!/^\d{4}$/.test(pin)) { toast.error("PIN must be 4 digits"); return; }
    try {
      await submitPin({ data: { pin } });
      setPin("");
      setPinOpen(false);
      await qc.invalidateQueries({ queryKey: ["my-shop"] });
      await doCharge();
    } catch (err: any) { toast.error(err?.message || "Wrong PIN"); }
  }

  async function doCharge() {
    setPaying(true);
    try {
      const res = await submitSale({ data: { items: cart.map((c) => ({ product_id: c.product_id, quantity: c.quantity })), customer_phone } });
      setActiveSaleId(res.sale_id);
      toast.success("STK push sent to customer phone");
    } catch (err: any) {
      const msg = err?.message || "Could not start payment";
      if (msg === "PIN_EXPIRED") { setPinOpen(true); }
      else if (msg === "SUBSCRIPTION_EXPIRED") { toast.error("Subscription expired"); navigate({ to: "/subscription" }); }
      else toast.error(msg);
    } finally { setPaying(false); }
  }

  const statusQ = useQuery({
    queryKey: ["sale-status", activeSaleId],
    queryFn: () => checkStatus({ data: { sale_id: activeSaleId! } }),
    enabled: !!activeSaleId,
    refetchInterval: (q) => {
      const s = q.state.data?.sale?.payment_status;
      return s && s !== "pending" ? false : 3000;
    },
  });

  useEffect(() => {
    const s = statusQ.data?.sale?.payment_status;
    if (s === "completed") {
      toast.success("Payment received!");
      setCart([]); setCustomerPhone("");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["sales", "today"] });
    } else if (s === "failed" || s === "cancelled") {
      toast.error("Payment did not complete");
    }
  }, [statusQ.data?.sale?.payment_status, qc]);

  function closeStatus() { setActiveSaleId(null); }

  const list = products.data?.products ?? [];

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div>
        <h2 className="font-semibold mb-3">Products</h2>
        {list.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-muted-foreground">Add products first.</CardContent></Card>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {list.map((p: any) => (
              <button key={p.id} disabled={p.stock <= 0} onClick={() => addToCart(p)} className="text-left rounded-lg border bg-card p-3 hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-sm text-muted-foreground">Ksh {Number(p.price).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">{p.stock} left</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="font-semibold mb-3">Cart</h2>
        <Card>
          <CardContent className="p-3 space-y-3">
            {cart.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Empty</p> : (
              <ul className="divide-y">
                {cart.map((it) => (
                  <li key={it.product_id} className="py-2 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{it.name}</div>
                      <div className="text-xs text-muted-foreground">Ksh {it.price.toLocaleString()} × {it.quantity} = Ksh {(it.price * it.quantity).toLocaleString()}</div>
                    </div>
                    <Button size="icon" variant="outline" onClick={() => setQty(it.product_id, -1)}><Minus className="w-4 h-4" /></Button>
                    <span className="w-6 text-center">{it.quantity}</span>
                    <Button size="icon" variant="outline" onClick={() => setQty(it.product_id, 1)}><Plus className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setCart((c) => c.filter((x) => x.product_id !== it.product_id))}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-between font-bold text-lg pt-2 border-t">
              <span>Total</span>
              <span>Ksh {total.toLocaleString()}</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cust">Customer phone (M-Pesa)</Label>
              <Input id="cust" inputMode="numeric" placeholder="07XXXXXXXX" maxLength={10} value={customer_phone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </div>
            <Button onClick={startCheckout} disabled={paying || cart.length === 0} className="w-full h-12 text-lg">
              {paying ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
              Charge Ksh {total.toLocaleString()}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enter your 4-digit PIN</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="text-center text-2xl tracking-widest" autoFocus />
            <Button onClick={confirmPin} className="w-full">Confirm</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!activeSaleId} onOpenChange={(o) => { if (!o) closeStatus(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Payment</DialogTitle></DialogHeader>
          <PaymentStatusBody status={statusQ.data?.sale?.payment_status} onClose={closeStatus} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaymentStatusBody({ status, onClose }: { status?: string; onClose: () => void }) {
  if (!status || status === "pending") {
    return (
      <div className="text-center py-6 space-y-3">
        <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
        <p className="font-medium">Waiting for customer to complete M-Pesa payment...</p>
        <p className="text-sm text-muted-foreground">Ask them to enter their PIN on the phone.</p>
      </div>
    );
  }
  if (status === "completed") {
    return (
      <div className="text-center py-6 space-y-3">
        <CheckCircle2 className="w-12 h-12 mx-auto text-success" />
        <p className="font-semibold text-lg">Payment received</p>
        <Button onClick={onClose} className="w-full">New sale</Button>
      </div>
    );
  }
  return (
    <div className="text-center py-6 space-y-3">
      <XCircle className="w-12 h-12 mx-auto text-destructive" />
      <p className="font-semibold text-lg">Payment failed</p>
      <Button onClick={onClose} variant="outline" className="w-full">Try again</Button>
    </div>
  );
}