import { Link } from "wouter";
import { MonitorX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

function NotFound() {
  return (
    <Empty className="py-24">
      <EmptyHeader>
        <EmptyMedia>
          <MonitorX className="size-5" />
        </EmptyMedia>
        <EmptyTitle>Page not found</EmptyTitle>
        <EmptyDescription>
          The page you're looking for doesn't exist or has been moved.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link href="/">
          <Button>Back to overview</Button>
        </Link>
      </EmptyContent>
    </Empty>
  );
}

export default NotFound;
