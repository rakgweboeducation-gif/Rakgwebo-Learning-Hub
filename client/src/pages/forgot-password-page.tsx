import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { useToast } from "../hooks/use-toast";
import { apiUrl } from "../lib/api-config";

export default function ForgotPasswordPage() {
const [email, setEmail] = useState("");
const { toast } = useToast();

const mutation = useMutation({
mutationFn: async (data: { email: string }) => {
// ✅ FIX: only ONE request
const res = await fetch(apiUrl("/api/auth/forgot-password"), {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify(data),
});

```
  if (!res.ok) {
    throw new Error("Failed to send reset email");
  }

  return res.json();
},
onSuccess: () => {
  toast({
    title: "Email sent",
    description: "Check your inbox for reset instructions",
  });
},
onError: (error: any) => {
  toast({
    title: "Error",
    description: error.message,
    variant: "destructive",
  });
},
```

});

return ( <div className="min-h-screen flex items-center justify-center bg-gray-50"> <Card className="w-full max-w-md"> <CardContent className="p-6 space-y-4"> <h1 className="text-xl font-bold text-center">
Forgot Password </h1>

```
      <Input
        type="email"
        placeholder="Enter your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <Button
        className="w-full"
        onClick={() => mutation.mutate({ email })}
        disabled={mutation.isPending}
      >
        Send Reset Link
      </Button>
    </CardContent>
  </Card>
</div>
```

);
}
