import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyShop } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, Home, Package, ShoppingCart, History, CreditCard } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({ component: AuthLayout });

function AuthLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const fetchShop = useServerFn(getMyShop);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (!data.session) {
        navigate({ to: "/login" });
      } else {
        setReady(true);
      }
    });
    return () => { mounted = false; };
  }, [navigate]);

  const shopQuery = useQuery({
    queryKey: ["my-shop"],
    queryFn: () => fetchShop(),
    enabled: ready,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!shopQuery.data) return;
    if (shopQuery.data.needs_onboarding && pathname !== "/onboarding") {
      navigate({ to: "/onboarding" });
    }
  }, [shopQuery.data, pathname, navigate]);

  async function logout() {
    await supabase.auth.signOut();
    toast.success("Logged out");
    navigate({ to: "/login" });
  }

  if (!ready || shopQuery.isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }
  if (shopQuery.error) {
    return <div className="min-h-screen flex items-center justify-center text-destructive p-4 text-center">{(shopQuery.error as Error).message}</div>;
  }
  const shop = shopQuery.data!;

  const navItems = [
    { to: "/dashboard", label: "Home", icon: Home },
    { to: "/products", label: "Stock", icon: Package },
    { to: "/sell", label: "Sell", icon: ShoppingCart },
    { to: "/history", label: "History", icon: History },
    { to: "/subscription", label: "Plan", icon: CreditCard },
  ] as const;

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-semibold">{shop.shop_name}</div>
            <div className="text-xs text-muted-foreground">
              {shop.subscription_active
                ? `${shop.subscription_status === "trial" ? "Trial" : "Active"} · ${shop.days_remaining} day${shop.days_remaining === 1 ? "" : "s"} left`
                : "Subscription expired"}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}><LogOut className="w-4 h-4 mr-1" />Logout</Button>
        </div>
        {!shop.subscription_active && pathname !== "/subscription" && (
          <div className="bg-destructive text-destructive-foreground text-sm px-4 py-2 text-center">
            Your subscription has expired. <Link to="/subscription" className="underline font-semibold">Renew now</Link>
          </div>
        )}
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 pb-24 sm:pb-6">
        <Outlet />
      </main>
      {!shop.needs_onboarding && (
        <nav className="fixed bottom-0 inset-x-0 sm:static bg-card border-t sm:border-0">
          <div className="max-w-5xl mx-auto grid grid-cols-5 sm:hidden">
            {navItems.map((n) => (
              <Link key={n.to} to={n.to} className="flex flex-col items-center justify-center py-2 text-xs text-muted-foreground [&.active]:text-primary" activeProps={{ className: "active" }}>
                <n.icon className="w-5 h-5 mb-0.5" />
                {n.label}
              </Link>
            ))}
          </div>
          <div className="hidden sm:flex max-w-5xl mx-auto px-4 gap-1 border-t bg-card -mt-px">
            {navItems.map((n) => (
              <Link key={n.to} to={n.to} className="px-4 py-3 text-sm text-muted-foreground hover:text-foreground [&.active]:text-primary [&.active]:font-semibold flex items-center gap-2" activeProps={{ className: "active" }}>
                <n.icon className="w-4 h-4" />{n.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}