import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSalesHistory } from "@/lib/sales.functions";
import { listProducts } from "@/lib/products.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Package, AlertTriangle, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

function Dashboard() {
  const fetchSales = useServerFn(listSalesHistory);
  const fetchProducts = useServerFn(listProducts);
  const sales = useQuery({ queryKey: ["sales", "today"], queryFn: () => fetchSales({ data: { period: "today", page: 1, limit: 100 } }) });
  const products = useQuery({ queryKey: ["products"], queryFn: () => fetchProducts() });

  const paidToday = (sales.data?.sales ?? []).filter((s: any) => s.payment_status === "completed");
  const totalToday = paidToday.reduce((sum: number, s: any) => sum + Number(s.total_amount), 0);
  const lowStock = (products.data?.products ?? []).filter((p: any) => p.stock <= p.reorder_level);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Today's sales" value={`Ksh ${totalToday.toLocaleString()}`} icon={TrendingUp} />
        <Stat label="Transactions" value={String(paidToday.length)} icon={ShoppingCart} />
        <Stat label="Products" value={String(products.data?.products?.length ?? 0)} icon={Package} />
        <Stat label="Low stock" value={String(lowStock.length)} icon={AlertTriangle} accent={lowStock.length > 0} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button asChild size="lg" className="h-20 text-lg"><Link to="/sell"><ShoppingCart className="w-5 h-5 mr-2" />New Sale</Link></Button>
        <Button asChild size="lg" variant="outline" className="h-20 text-lg"><Link to="/products"><Package className="w-5 h-5 mr-2" />Manage Stock</Link></Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent sales today</CardTitle></CardHeader>
        <CardContent>
          {paidToday.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed sales yet today.</p>
          ) : (
            <ul className="divide-y">
              {paidToday.slice(0, 5).map((s: any) => (
                <li key={s.id} className="py-2 flex justify-between text-sm">
                  <span className="text-muted-foreground">{new Date(s.sold_at).toLocaleTimeString()}</span>
                  <span className="font-medium">Ksh {Number(s.total_amount).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {lowStock.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-warning" />Low stock alert</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y">
              {lowStock.map((p: any) => (
                <li key={p.id} className="py-2 flex justify-between text-sm">
                  <span>{p.name}</span>
                  <span className="text-warning font-medium">{p.stock} left</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, accent }: { label: string; value: string; icon: any; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={`text-xl font-bold ${accent ? "text-warning" : ""}`}>{value}</div>
          </div>
          <Icon className={`w-5 h-5 ${accent ? "text-warning" : "text-muted-foreground"}`} />
        </div>
      </CardContent>
    </Card>
  );
}