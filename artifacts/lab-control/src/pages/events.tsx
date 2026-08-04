import { getGetLabEventsQueryKey, useGetLabEvents } from "@workspace/api-client-react";
import {
  Activity,
  AlertTriangle,
  Ban,
  CircleDot,
  LogIn,
  Monitor,
  ShieldAlert,
  UserPlus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/format";

const EVENT_ICONS: Record<string, typeof Activity> = {
  operator_action: Monitor,
  student_login: LogIn,
  student_logout: LogIn,
  usb_blocked: Ban,
  usb_policy_change: ShieldAlert,
  login_failure: AlertTriangle,
  hardware_issue: AlertTriangle,
};

function EventTypeBadge({ type }: { type: string }) {
  const variant =
    type === "usb_blocked" || type === "login_failure" || type === "hardware_issue"
      ? "destructive"
      : type === "usb_policy_change"
        ? "warning"
        : "default";
  return <Badge variant={variant as "default" | "destructive" | "warning"}>{type.replaceAll("_", " ")}</Badge>;
}

function Events() {
  const { data: events, isLoading } = useGetLabEvents({
    query: { queryKey: getGetLabEventsQueryKey(), refetchInterval: 15_000 },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Activity Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The 50 most recent events across the lab.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : events && events.length > 0 ? (
            <ul className="divide-y">
              {events.map((event) => {
                const Icon = EVENT_ICONS[event.type] ?? CircleDot;
                return (
                  <li key={event.id} className="flex items-start gap-3 px-6 py-4">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{event.message}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {event.actor} · {timeAgo(event.createdAt)}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <EventTypeBadge type={event.type} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia>
                  <Activity className="size-5" />
                </EmptyMedia>
                <EmptyTitle>No events recorded</EmptyTitle>
                <EmptyDescription>
                  Operator actions, student logins, and USB events will appear here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Events;
