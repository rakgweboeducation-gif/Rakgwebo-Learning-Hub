import { useAuth } from "../hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "../hooks/use-toast";
import { useState } from "react";
import { apiUrl } from "../lib/api-config";

function formatZAR(cents: number): string {
  return "R" + (cents / 100).toFixed(2);
}

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
  const { toast } = useToast();

  const { data: earnings, isLoading: earningsLoading } = useQuery({
    queryKey: ["/api/tutor-earnings"],
    enabled: !!user,
  });

  const { data: paymentsList } = useQuery({
    queryKey: ["/api/payments"],
    enabled: !!user,
  });

  const { data: rate } = useQuery({
    queryKey: ["/api/tutor-rates", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const res = await fetch(apiUrl(`/api/tutor-rates/${user.id}`), {
        credentials: "include",
      });
      return res.json();
    },
    enabled: !!user?.id,
  });

  const [newRate, setNewRate] = useState("");
  const [updatingRate, setUpdatingRate] = useState(false);

  const handleUpdateRate = async () => {
    const parsed = parseFloat(newRate);
    if (isNaN(parsed) || parsed < 0) {
      toast({
        title: "Invalid input",
        description: "Enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    const rateInCents = Math.round(parsed * 100);

    setUpdatingRate(true);
    try {
      await apiRequest("POST", "/api/tutor-rates", {
        hourlyRate: rateInCents,
      });

      queryClient.invalidateQueries({
        queryKey: ["/api/tutor-rates"],
      });

      toast({ title: "Rate updated successfully" });
      setNewRate("");
    } catch (err: any) {
      toast({
        title: "Failed to update rate",
        description: err?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setUpdatingRate(false);
    }
  };

  const e = earnings as any;

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
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-lg font-semibold">
              Current:{" "}
              {formatZAR((rate as any)?.hourlyRate ?? 15000)} / hour
            </p>

            <Input
              type="number"
              placeholder="e.g. 200"
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
            />

            <Button onClick={handleUpdateRate} disabled={updatingRate}>
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

function LearnerPaymentsView() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payments</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          Payment features coming soon.
        </p>
      </CardContent>
    </Card>
  );
}