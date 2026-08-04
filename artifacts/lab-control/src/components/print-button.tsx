import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer className="size-4" />
      {label}
    </Button>
  );
}
