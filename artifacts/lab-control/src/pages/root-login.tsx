import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { Server } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function RootLogin() {
  const [, navigate] = useLocation();
  const [slug, setSlug] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = slug.trim().toLowerCase();
    if (!trimmed) {
      toast.error("Enter your lab address.");
      return;
    }
    navigate(`/t/${trimmed}/login`);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Server className="size-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Computer Management System</h1>
            <p className="text-sm text-muted-foreground">Computer Manager</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in to your lab</CardTitle>
            <CardDescription>
              Each lab has its own address. Enter the address you were given when
              your lab was created.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="slug">Lab address</Label>
                <Input
                  id="slug"
                  placeholder="e.g. demo-lab"
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Your full address looks like{" "}
                  <span className="font-medium text-foreground">
                    …/t/demo-lab/login
                  </span>
                </p>
              </div>
              <Button type="submit" className="w-full">
                Continue
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              New here?{" "}
              <Link href="/register" className="font-medium text-foreground underline">
                Create a lab
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default RootLogin;
