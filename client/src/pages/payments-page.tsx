```tsx
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Receipt, Trash2, Star, DollarSign, TrendingUp, Clock, Loader2, Plus, Building2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQuery as useRQ } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { apiUrl } from "@/lib/api-config";

function formatZAR(cents: number) {
  return `R${(cents / 100).toFixed(2)}`;
}

const statusColors: Record<string, string> = {
  authorized: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  captured: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  refunded: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

export default function PaymentsPage() {
  const { user } = useAuth();
  const isTutor = user?.role === "tutor";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {isTutor ? "Earnings & Payments" : "Payments"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {isTutor
            ? "Track your earnings and payout history."
            : "Manage your payment methods and view receipts."}
        </p>
      </div>

      {isTutor ? <TutorEarningsView /> : <LearnerPaymentsView />}
    </div>
  );
}

function TutorEarningsView() {
  const { user } = useAuth();

  const { data: earnings, isLoading: earningsLoading } = useQuery({
    queryKey: ["/api/tutor-earnings"],
    enabled: !!user,
  });

  const { data: paymentsList, isLoading: paymentsLoading } = useQuery({
    queryKey: ["/api/payments"],
    enabled: !!user,
  });

  const { data: rate } = useQuery({
    queryKey: ["/api/tutor-rates", user?.id],
    queryFn: () =>
      fetch(apiUrl(`/api/tutor-rates/${user!.id}`), {
        credentials: "include",
      }).then((r) => r.json()),
    enabled: !!user,
  });

  const [newRate, setNewRate] = useState("");
  const [updatingRate, setUpdatingRate] = useState(false);
  const { toast } = useToast();

  const handleUpdateRate = async () => {
    const rateInCents = Math.round(parseFloat(newRate) * 100);
    if (isNaN(rateInCents) || rateInCents < 0) return;

    setUpdatingRate(true);
    try {
      await apiRequest("POST", "/api/tutor-rates", {
        hourlyRate: rateInCents,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tutor-rates"] });
      toast({ title: "Rate updated" });
      setNewRate("");
    } catch (err: any) {
      toast({
        title: "Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setUpdatingRate(false);
    }
  };

  const e = earnings as any;
  const payments = (paymentsList || []) as any[];

  return (
    <div className="space-y-6">
      {earningsLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <p className="text-2xl font-bold">
                {formatZAR(e?.total || 0)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your Hourly Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <p className="text-lg font-semibold">
              Current: {formatZAR(rate?.hourlyRate ?? 15000)}/hour
            </p>

            <Input
              type="number"
              placeholder="e.g. 200"
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
            />

            <Button onClick={handleUpdateRate}>
              {updatingRate ? (
                <Loader2 className="animate-spin w-4 h-4" />
              ) : (
                "Update"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```
