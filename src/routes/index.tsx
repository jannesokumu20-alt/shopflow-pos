import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
  }, []);
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center px-4">
      <div className="max-w-xl text-center space-y-6">
        <div className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wide">Shop POS</div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Sell, get paid on M-Pesa, track everything.</h1>
        <p className="text-muted-foreground text-lg">Built for Kenyan shop owners. Manage stock, accept M-Pesa via STK push, and run your shop from your phone.</p>
        <div className="flex gap-3 justify-center pt-2">
          {hasSession ? (
            <Button asChild size="lg"><Link to="/dashboard">Open dashboard</Link></Button>
          ) : (
            <>
              <Button asChild size="lg"><Link to="/register">Start 7-day free trial</Link></Button>
              <Button asChild size="lg" variant="outline"><Link to="/login">Login</Link></Button>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground pt-4">After trial: Ksh 499/month. Cancel anytime.</p>
      </div>
    </div>
  );
}
