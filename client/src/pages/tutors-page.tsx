import { useState, useEffect } from "react";
import { useTutors, useCreateTutorSession, useTutorAvailability } from "../hooks/use-modules";
import { useAuth } from "../hooks/use-auth";
import type { User, TutorAvailability } from "@shared/schema";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { TappableAvatar, ExpandableBio } from "../components/profile-viewer";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Separator } from "../components/ui/separator";
import { Users, GraduationCap, Calendar, Loader2, CreditCard, Check, ArrowRight, ArrowLeft, Clock } from "lucide-react";
import { Skeleton } from "../components/ui/skeleton";
import { useToast } from "../hooks/use-toast";
import { apiRequest, queryClient } from "../lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "../lib/api-config";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatZAR(cents: number) {
  return `R${(cents / 100).toFixed(2)}`;
}

type BookingStep = "details" | "payment" | "confirm";

export default function TutorsPage() {
  const { user } = useAuth();
  const { data: tutors, isLoading } = useTutors();
  const createSession = useCreateTutorSession();
  const { toast } = useToast();
  const [selectedTutor, setSelectedTutor] = useState<User | null>(null);
  const [topic, setTopic] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState(60);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bookingStep, setBookingStep] = useState<BookingStep>("details");
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  const { data: paymentMethods } = useQuery({
    queryKey: ["/api/payment-methods"],
    enabled: !!user,
  });

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<number | null>(null);
  const [tutorRate, setTutorRate] = useState<number>(15000);

  useEffect(() => {
    if (selectedTutor) {
      fetch(`/api/tutor-rates/${selectedTutor.id}`, { credentials: "include" })
        .then(r => r.json())
        .then(data => setTutorRate(data.hourlyRate || 15000))
      fetch(apiUrl(`/api/tutor-rates/${selectedTutor.id}`), { credentials: "include" })
        .then(r => r.json())
        .then(data => setTutorRate(data.hourlyRate ?? 15000))
        .catch(() => setTutorRate(15000));
    }
  }, [selectedTutor]);

  useEffect(() => {
    if (paymentMethods && (paymentMethods as any[]).length > 0) {
      const defaultMethod = (paymentMethods as any[]).find((m: any) => m.isDefault);
      setSelectedPaymentMethod(defaultMethod?.id || (paymentMethods as any[])[0]?.id);
    }
  }, [paymentMethods]);

  const sessionCost = Math.round((tutorRate / 60) * duration);
  const platformFee = Math.round(sessionCost * 0.15);
  const totalAmount = sessionCost + platformFee;

  const handleBookAndPay = async () => {
    if (!selectedTutor || !date || !startTime) return;
    setIsAuthorizing(true);

    try {
      const start = new Date(`${date}T${startTime}`);
      const end = new Date(start.getTime() + duration * 60 * 1000);

      const session = await apiRequest("POST", "/api/tutor-sessions", {
        tutorId: selectedTutor.id,
        learnerId: user!.id,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        topic: topic || null,
        status: "requested",
        meetingLink: null,
      });
      const sessionData = await session.json();

      if (!selectedPaymentMethod) {
        throw new Error("Please select a payment method first.");
      }

      await apiRequest("POST", "/api/payments/authorize", {
        sessionId: sessionData.id,
        paymentMethodId: selectedPaymentMethod,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/tutor-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });

      toast({ title: "Session booked!", description: `Payment of ${formatZAR(totalAmount)} has been authorized. You'll only be charged after the session.` });
      setDialogOpen(false);
      setBookingStep("details");
      setTopic("");
      setDate("");
      setStartTime("");
      setDuration(60);
    } catch (err: any) {
      toast({ title: "Booking failed", description: err.message || "Something went wrong", variant: "destructive" });
    } finally {
      setIsAuthorizing(false);
    }
  };

  const resetDialog = () => {
    setBookingStep("details");
    setTopic("");
    setDate("");
    setStartTime("");
    setDuration(60);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Find a Tutor</h1>
        <p className="text-muted-foreground mt-1">Browse and book sessions with approved tutors.</p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-lg" />)}
        </div>
      ) : !tutors || (tutors as User[]).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Users className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-medium">No tutors available yet</p>
            <p className="text-sm mt-1">Check back soon for approved tutors.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(tutors as User[]).map(tutor => (
            <TutorCard
              key={tutor.id}
              tutor={tutor}
              isSelected={dialogOpen && selectedTutor?.id === tutor.id}
              onSelect={() => { setSelectedTutor(tutor); setDialogOpen(true); resetDialog(); }}
            />
          ))}
        </div>
      )}

      {/* Booking Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetDialog(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {bookingStep === "details" && `Book Session with ${selectedTutor?.name || selectedTutor?.username}`}
              {bookingStep === "payment" && "Payment Method"}
              {bookingStep === "confirm" && "Confirm & Pay"}
            </DialogTitle>
          </DialogHeader>

          {bookingStep === "details" && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Topic (optional)</Label>
                <Textarea placeholder="e.g. Trigonometry, Algebra..." value={topic} onChange={e => setTopic(e.target.value)} data-testid="input-topic" />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid="input-date" />
              </div>
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} data-testid="input-time" />
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <div className="flex gap-2">
                  {[30, 45, 60, 90, 120].map(d => (
                    <Button key={d} size="sm" variant={duration === d ? "default" : "outline"} onClick={() => setDuration(d)} data-testid={`button-duration-${d}`}>
                      {d} min
                    </Button>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Rate</span>
                  <span data-testid="text-hourly-rate">{formatZAR(tutorRate)}/hour</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Session ({duration} min)</span>
                  <span>{formatZAR(sessionCost)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Platform fee (15%)</span>
                  <span>{formatZAR(platformFee)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span data-testid="text-total-amount">{formatZAR(totalAmount)}</span>
                </div>
              </div>
            </div>
          )}

          {bookingStep === "payment" && (
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">Choose a payment method or add a new one.</p>

              {(paymentMethods as any[] || []).length === 0 ? (
                <div className="text-center py-6">
                  <CreditCard className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">No payment methods saved</p>
                  <AddCardForm onAdded={() => queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] })} />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {(paymentMethods as any[]).map((pm: any) => (
                      <button
                        key={pm.id}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${selectedPaymentMethod === pm.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                        onClick={() => setSelectedPaymentMethod(pm.id)}
                        data-testid={`button-select-payment-${pm.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <CreditCard className="w-5 h-5 text-muted-foreground" />
                          <div className="text-left">
                            <p className="text-sm font-medium">{pm.cardBrand} •••• {pm.cardLast4}</p>
                            <p className="text-xs text-muted-foreground">Expires {pm.expiryMonth}/{pm.expiryYear}</p>
                          </div>
                        </div>
                        {selectedPaymentMethod === pm.id && <Check className="w-5 h-5 text-primary" />}
                      </button>
                    ))}
                  </div>
                  <Separator />
                  <AddCardForm onAdded={() => queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] })} />
                </>
              )}
            </div>
          )}

          {bookingStep === "confirm" && (
            <div className="space-y-4 py-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-sm">Session Details</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Tutor</span><span>{selectedTutor?.name || selectedTutor?.username}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{date}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span>{startTime}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span>{duration} minutes</span></div>
                  {topic && <div className="flex justify-between"><span className="text-muted-foreground">Topic</span><span>{topic}</span></div>}
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h4 className="font-medium text-sm">Payment</h4>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Session ({duration} min)</span>
                  <span>{formatZAR(sessionCost)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Platform fee</span>
                  <span>{formatZAR(platformFee)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total (hold)</span>
                  <span>{formatZAR(totalAmount)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Your card will be authorized (held) for this amount. You'll only be charged the final amount after the session ends, based on actual duration.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            {bookingStep === "details" && (
              <Button onClick={() => setBookingStep("payment")} disabled={!date || !startTime} className="w-full" data-testid="button-next-to-payment">
                Next: Payment <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
            {bookingStep === "payment" && (
              <div className="flex gap-2 w-full">
                <Button variant="outline" onClick={() => setBookingStep("details")} data-testid="button-back-to-details">
                  <ArrowLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button onClick={() => setBookingStep("confirm")} disabled={!selectedPaymentMethod} className="flex-1" data-testid="button-next-to-confirm">
                  Review <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            )}
            {bookingStep === "confirm" && (
              <div className="flex gap-2 w-full">
                <Button variant="outline" onClick={() => setBookingStep("payment")} data-testid="button-back-to-payment">
                  <ArrowLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button onClick={handleBookAndPay} disabled={isAuthorizing} className="flex-1" data-testid="button-confirm-and-pay">
                  {isAuthorizing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
                  Confirm & Pay {formatZAR(totalAmount)}
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TutorCard({ tutor, isSelected, onSelect }: { tutor: User; isSelected: boolean; onSelect: () => void }) {
  const [rate, setRate] = useState<number | null>(null);
  const { data: availability } = useTutorAvailability(tutor.id);

  useEffect(() => {
    fetch(`/api/tutor-rates/${tutor.id}`, { credentials: "include" })
      .then(r => r.json())
      .then(data => setRate(data.hourlyRate || 15000))
    fetch(apiUrl(`/api/tutor-rates/${tutor.id}`), { credentials: "include" })
      .then(r => r.json())
      .then(data => setRate(data.hourlyRate ?? 15000))
      .catch(() => setRate(15000));
  }, [tutor.id]);

  const availableDays = availability && availability.length > 0
    ? [...new Set(availability.map(s => s.dayOfWeek))].sort().map(d => DAY_NAMES[d])
    : null;

  return (
    <Card data-testid={`card-tutor-${tutor.id}`}>
      <CardContent className="p-6">
        <div className="flex items-start gap-4 mb-4">
          <Avatar className="h-12 w-12">
            <AvatarImage src={tutor.avatar || undefined} />
            <AvatarFallback>{(tutor.name || tutor.username).substring(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <TappableAvatar
            src={tutor.avatar}
            fallback={(tutor.name || tutor.username).substring(0, 2).toUpperCase()}
            className="h-12 w-12"
            name={tutor.name || tutor.username}
            data-testid={`avatar-tutor-${tutor.id}`}
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{tutor.name || tutor.username} {tutor.surname || ""}</h3>
            <p className="text-sm text-muted-foreground">@{tutor.username}</p>
            {tutor.grade && (
              <Badge variant="secondary" className="mt-1">
                <GraduationCap className="w-3 h-3 mr-1" />
                Grade {tutor.grade}
              </Badge>
            )}
          </div>
        </div>
        {tutor.bio && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{tutor.bio}</p>}
        {tutor.bio && <ExpandableBio bio={tutor.bio} className="mb-3" data-testid={`bio-tutor-${tutor.id}`} />}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {rate !== null && (
            <Badge variant="outline" className="text-green-700 border-green-300 dark:text-green-400 dark:border-green-700" data-testid={`text-rate-${tutor.id}`}>
              {formatZAR(rate)}/hour
            </Badge>
          )}
        </div>
        {availableDays && (
          <div className="mb-3" data-testid={`availability-${tutor.id}`}>
            <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Available
            </p>
            <div className="flex flex-wrap gap-1">
              {availableDays.map(day => (
                <Badge key={day} variant="secondary" className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                  {day}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {availability && availability.length > 0 && (
          <div className="mb-3 space-y-0.5">
            {[...new Set(availability.map(s => s.dayOfWeek))].sort().slice(0, 3).map(day => {
              const daySlots = availability.filter(s => s.dayOfWeek === day);
              return (
                <p key={day} className="text-xs text-muted-foreground">
                  {DAY_NAMES[day]}: {daySlots.map(s => `${s.startTime}-${s.endTime}`).join(", ")}
                </p>
              );
            })}
            {[...new Set(availability.map(s => s.dayOfWeek))].length > 3 && (
              <p className="text-xs text-muted-foreground">+{[...new Set(availability.map(s => s.dayOfWeek))].length - 3} more days</p>
            )}
          </div>
        )}
        <Button className="w-full" onClick={onSelect} data-testid={`button-book-${tutor.id}`}>
          <Calendar className="w-4 h-4 mr-2" />
          Book Session
        </Button>
      </CardContent>
    </Card>
  );
}

function AddCardForm({ onAdded }: { onAdded: () => void }) {
  const [cardNumber, setCardNumber] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const { toast } = useToast();

  const handleAdd = async () => {
    if (!cardNumber || !expiryMonth || !expiryYear) return;
    setIsAdding(true);
    try {
      await apiRequest("POST", "/api/payment-methods", {
        cardNumber: cardNumber.replace(/\s/g, ""),
        expiryMonth,
        expiryYear,
      });
      toast({ title: "Card added" });
      onAdded();
      setShowForm(false);
      setCardNumber("");
      setExpiryMonth("");
      setExpiryYear("");
    } catch (err: any) {
      toast({ title: "Failed to add card", description: err.message, variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  if (!showForm) {
    return (
      <Button variant="outline" size="sm" onClick={() => setShowForm(true)} data-testid="button-add-card">
        <CreditCard className="w-4 h-4 mr-2" /> Add Card
      </Button>
    );
  }

  return (
    <div className="space-y-3 border rounded-lg p-3">
      <p className="text-sm font-medium">Add Payment Card</p>
      <p className="text-xs text-muted-foreground">For testing, use card number 4242 4242 4242 4242</p>
      <div className="space-y-2">
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
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
        <Button size="sm" onClick={handleAdd} disabled={isAdding || !cardNumber || !expiryMonth || !expiryYear} data-testid="button-save-card">
          {isAdding ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
          Save Card
        </Button>
      </div>
    </div>
  );
}
