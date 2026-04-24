import { useAuth } from "../hooks/use-auth";
import { useHelpRequests, useUpdateHelpRequest } from "../hooks/use-modules";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { HelpCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Skeleton } from "../components/ui/skeleton";

export default function HelpRequestsPage() {
  const { user } = useAuth();
  const { data: requests, isLoading } = useHelpRequests();
  const updateRequest = useUpdateHelpRequest();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Help Requests</h1>
        <p className="text-muted-foreground mt-1">Review and respond to learner questions.</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : !requests || requests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <HelpCircle className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-medium">No help requests right now</p>
            <p className="text-sm mt-1">Check back later for new requests from learners.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map(req => (
            <Card key={req.id}>
              <CardContent className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{req.content}</p>
                    <Badge variant={req.status === "open" ? "destructive" : "default"}>
                      {req.status}
                    </Badge>
                  </div>
                  {req.page && <p className="text-sm text-muted-foreground">Page {req.page}</p>}
                  <p className="text-xs text-muted-foreground">{req.createdAt ? new Date(req.createdAt).toLocaleDateString() : ""}</p>
                </div>
                {req.status === "open" && user?.role === "tutor" && (
                  <Button
                    onClick={() => updateRequest.mutate({ id: req.id, status: "resolved", tutorId: user.id })}
                    disabled={updateRequest.isPending}
                    data-testid={`button-resolve-${req.id}`}
                  >
                    {updateRequest.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                    Mark Resolved
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
