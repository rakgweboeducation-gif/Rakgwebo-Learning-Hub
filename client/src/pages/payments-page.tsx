import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
          {isTutor ? "Earnings & Payments" : "Payments"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {isTutor ? "Track your earnings and payout history." : "Manage your payment methods and view receipts."}
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
    queryFn: () => fetch(`/api/tutor-rates/${user!.id}`, { credentials: "include" }).then(r => r.json()),
    queryFn: () => fetch(apiUrl(`/api/tutor-rates/${user!.id}`), { credentials: "include" }).then(r => r.json()),
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
      await apiRequest("POST", "/api/tutor-rates", { hourlyRate: rateInCents });
      queryClient.invalidateQueries({ queryKey: ["/api/tutor-rates"] });
      toast({ title: "Rate updated" });
      setNewRate("");
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setUpdatingRate(false);
    }
  };

  const e = earnings as any;
  const payments = (paymentsList || []) as any[];

  return (
    <div className="space-y-6">
      {/* Earnings Summary */}
      {earningsLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                <DollarSign className="w-4 h-4" />
                Total Earned
              </div>
              <p className="text-2xl font-bold" data-testid="text-total-earned">{formatZAR(e?.total || 0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                <Clock className="w-4 h-4" />
                Pending
              </div>
              <p className="text-2xl font-bold" data-testid="text-pending">{formatZAR(e?.pending || 0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                <TrendingUp className="w-4 h-4" />
                Completed Sessions
              </div>
              <p className="text-2xl font-bold" data-testid="text-completed-sessions">{e?.completed || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                <Receipt className="w-4 h-4" />
                Total Sessions
              </div>
              <p className="text-2xl font-bold">{e?.sessionsCount || 0}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Set Rate */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Hourly Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <p className="text-lg font-semibold" data-testid="text-current-rate">
              Current: {formatZAR(rate?.hourlyRate || 15000)}/hour
              Current: {formatZAR(rate?.hourlyRate ?? 15000)}/hour
            </p>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-muted-foreground">R</span>
              <Input
                type="number"
                placeholder="New rate (e.g. 200)"
                min="0"
                placeholder="e.g. 0 or 200"
                value={newRate}
                onChange={e => setNewRate(e.target.value)}
                className="w-32"
                data-testid="input-new-rate"
              />
              <Button size="sm" onClick={handleUpdateRate} disabled={updatingRate || !newRate} data-testid="button-update-rate">
                {updatingRate ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <TutorBankDetailsForm />

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment History</CardTitle>
        </CardHeader>
        <CardContent>
          {paymentsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded" />)}
            </div>
          ) : payments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No payments yet</p>
          ) : (
            <div className="space-y-3">
              {payments.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border" data-testid={`payment-row-${p.id}`}>
                  <div>
                    <p className="text-sm font-medium">{p.durationMinutes} min session</p>
                    <p className="text-xs text-muted-foreground">
                      {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={statusColors[p.status]} variant="secondary">{p.status}</Badge>
                    <span className="font-semibold text-sm">{formatZAR(p.tutorEarnings)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TutorBankDetailsForm() {
  const { toast } = useToast();
  const { data: bankDetails, isLoading } = useRQ({
    queryKey: ["/api/tutor-bank-details"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/tutor-bank-details"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load bank details");
      return res.json();
    },
  });

  const [bankName, setBankName] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [accountType, setAccountType] = useState("cheque");
  const [isSaving, setIsSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (bankDetails && !loaded) {
      setBankName(bankDetails.bankName || "");
      setAccountHolder(bankDetails.accountHolder || "");
      setAccountNumber(bankDetails.accountNumber || "");
      setBranchCode(bankDetails.branchCode || "");
      setAccountType(bankDetails.accountType || "cheque");
      setLoaded(true);
    }
  }, [bankDetails, loaded]);

  const handleSave = async () => {
    if (!bankName || !accountHolder || !accountNumber || !branchCode) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      await apiRequest("POST", "/api/tutor-bank-details", {
        bankName, accountHolder, accountNumber, branchCode, accountType,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tutor-bank-details"] });
      toast({ title: "Bank details saved successfully" });
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <Skeleton className="h-48 rounded-lg" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          Payout Bank Details
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Enter your bank account details so we can send your earnings to you.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Bank Name</label>
            <Input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. FNB, Standard Bank" data-testid="input-tutor-bank-name" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Account Holder</label>
            <Input value={accountHolder} onChange={e => setAccountHolder(e.target.value)} placeholder="Full name as on bank account" data-testid="input-tutor-account-holder" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Account Number</label>
            <Input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="Your account number" data-testid="input-tutor-account-number" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Branch Code</label>
            <Input value={branchCode} onChange={e => setBranchCode(e.target.value)} placeholder="e.g. 250655" data-testid="input-tutor-branch-code" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Account Type</label>
            <Select value={accountType} onValueChange={setAccountType}>
              <SelectTrigger data-testid="select-tutor-account-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cheque">Cheque / Current</SelectItem>
                <SelectItem value="savings">Savings</SelectItem>
                <SelectItem value="transmission">Transmission</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button className="mt-4" onClick={handleSave} disabled={isSaving} data-testid="button-save-bank-details">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Save Bank Details
        </Button>
      </CardContent>
    </Card>
  );
}

function LearnerPaymentsView() {
  const { user } = useAuth();
  const { data: paymentMethods, isLoading: methodsLoading } = useQuery({
    queryKey: ["/api/payment-methods"],
    enabled: !!user,
  });
  const { data: paymentsList, isLoading: paymentsLoading } = useQuery({
    queryKey: ["/api/payments"],
    enabled: !!user,
  });

  const { toast } = useToast();
  const methods = (paymentMethods || []) as any[];
  const payments = (paymentsList || []) as any[];

  const [showAddCard, setShowAddCard] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const handleAddCard = async () => {
    if (!cardNumber || !expiryMonth || !expiryYear) return;
    setIsAdding(true);
    try {
      await apiRequest("POST", "/api/payment-methods", {
        cardNumber: cardNumber.replace(/\s/g, ""),
        expiryMonth,
        expiryYear,
      });
      toast({ title: "Card added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      setShowAddCard(false);
      setCardNumber("");
      setExpiryMonth("");
      setExpiryYear("");
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteCard = async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/payment-methods/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      toast({ title: "Card removed" });
    } catch (err: any) {
      toast({ title: "Failed", variant: "destructive" });
    }
  };

  const handleSetDefault = async (id: number) => {
    try {
      await apiRequest("POST", `/api/payment-methods/${id}/default`);
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
    } catch (err) {}
  };

  return (
    <div className="space-y-6">
      {/* Payment Methods */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Payment Methods</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowAddCard(!showAddCard)} data-testid="button-add-card">
            <Plus className="w-4 h-4 mr-1" /> Add Card
          </Button>
        </CardHeader>
        <CardContent>
          {showAddCard && (
            <div className="space-y-3 border rounded-lg p-4 mb-4">
              <p className="text-sm font-medium">Add Payment Card</p>
              <p className="text-xs text-muted-foreground">For testing, use: 4242 4242 4242 4242</p>
              <Input
                placeholder="Card number"
                value={cardNumber}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 16);
                  setCardNumber(val.replace(/(.{4})/g, "$1 ").trim());
                }}
                data-testid="input-card-number"
              />
              <div className="flex gap-2">
                <Input placeholder="MM" value={expiryMonth} onChange={e => setExpiryMonth(e.target.value.replace(/\D/g, "").slice(0, 2))} className="w-20" data-testid="input-expiry-month" />
                <Input placeholder="YYYY" value={expiryYear} onChange={e => setExpiryYear(e.target.value.replace(/\D/g, "").slice(0, 4))} className="w-24" data-testid="input-expiry-year" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowAddCard(false)}>Cancel</Button>
                <Button size="sm" onClick={handleAddCard} disabled={isAdding || !cardNumber || !expiryMonth || !expiryYear} data-testid="button-save-card">
                  {isAdding ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  Save Card
                </Button>
              </div>
            </div>
          )}

          {methodsLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-16 rounded" />)}
            </div>
          ) : methods.length === 0 ? (
            <div className="text-center py-8">
              <CreditCard className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No cards saved yet. Add one to book sessions.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {methods.map((pm: any) => (
                <div key={pm.id} className="flex items-center justify-between p-3 rounded-lg border" data-testid={`card-row-${pm.id}`}>
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{pm.cardBrand} •••• {pm.cardLast4}</p>
                      <p className="text-xs text-muted-foreground">Expires {pm.expiryMonth}/{pm.expiryYear}</p>
                    </div>
                    {pm.isDefault && <Badge variant="secondary" className="text-xs">Default</Badge>}
                  </div>
                  <div className="flex gap-1">
                    {!pm.isDefault && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleSetDefault(pm.id)} title="Set as default" data-testid={`button-default-${pm.id}`}>
                        <Star className="w-4 h-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDeleteCard(pm.id)} title="Remove" data-testid={`button-delete-card-${pm.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction History / Receipts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {paymentsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded" />)}
            </div>
          ) : payments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No transactions yet. Book a tutoring session to get started.</p>
          ) : (
            <div className="space-y-3">
              {payments.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between p-4 rounded-lg border" data-testid={`receipt-row-${p.id}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{p.durationMinutes} min session</p>
                      <Badge className={statusColors[p.status]} variant="secondary">{p.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" }) : ""}
                      {" • "}Rate: {formatZAR(p.hourlyRate)}/hr
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">{formatZAR(p.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      Fee: {formatZAR(p.platformFee)} • Tutor: {formatZAR(p.tutorEarnings)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
