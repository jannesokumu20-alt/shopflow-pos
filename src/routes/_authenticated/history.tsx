import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSalesHistory } from "@/lib/sales.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/history")({ component: HistoryPage });

function HistoryPage() {
  const fetchSales = useServerFn(listSalesHistory);
  const [period, setPeriod] = useState<"today" | "yesterday" | "week" | "month" | "all">("today");
  const q = useQuery({ queryKey: ["sales", period], queryFn: () => fetchSales({ data: { period, page: 1, limit: 100 } }) });
  const sales = q.data?.sales ?? [];
  const totalPaid = sales.filter((s: any) => s.payment_status === "completed").reduce((sum: number, s: any) => sum + Number(s.total_amount), 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Sales history</h1>
      <Tabs value={period} onValueChange={(v) => setPeriod(v as any)}>
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="yesterday">Yesterday</TabsTrigger>
          <TabsTrigger value="week">7 days</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Total received</div><div className="text-2xl font-bold">Ksh {totalPaid.toLocaleString()}</div></CardContent></Card>
      {q.isLoading ? <p className="text-muted-foreground">Loading...</p> :
        sales.length === 0 ? <Card><CardContent className="p-6 text-center text-muted-foreground">No sales for this period.</CardContent></Card> :
        <div className="space-y-2">
          {sales.map((s: any) => (
            <Card key={s.id}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Ksh {Number(s.total_amount).toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">{new Date(s.sold_at).toLocaleString()} · {s.customer_phone}</div>
                  </div>
                  <StatusBadge status={s.payment_status} />
                </div>
                {s.sale_items?.length > 0 && (
                  <ul className="mt-2 text-xs text-muted-foreground">
                    {s.sale_items.map((it: any, i: number) => (
                      <li key={i}>{it.product_name} × {it.quantity} = Ksh {Number(it.line_total).toLocaleString()}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      }
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant: any = status === "completed" ? "default" : status === "pending" ? "secondary" : "destructive";
  const label = status === "completed" ? "Paid" : status === "pending" ? "Pending" : status === "failed" ? "Failed" : "Cancelled";
  return <Badge variant={variant}>{label}</Badge>;
}