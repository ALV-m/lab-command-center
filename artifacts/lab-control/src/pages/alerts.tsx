import { useQueryClient } from "@tanstack/react-query";
import {
  getGetLabAlertsQueryKey,
  getGetLabSummaryQueryKey,
  type LabAlert,
  useGetLabAlerts,
  useUpdateLabAlert,
} from "@workspace/api-client-react";
import { AlertTriangle, CheckCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertStatusBadge, SeverityBadge } from "@/components/badges";
import { timeAgo } from "@/lib/format";

function Alerts() {
  const queryClient = useQueryClient();
  const { data: alerts, isLoading } = useGetLabAlerts({
    query: { queryKey: getGetLabAlertsQueryKey(), refetchInterval: 15_000 },
  });

  const updateMutation = useUpdateLabAlert({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetLabAlertsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetLabSummaryQueryKey() });
        toast.success("Alert updated");
      },
      onError: (error) => toast.error(error.message),
    },
  });

  const acknowledge = (alert: LabAlert) => {
    updateMutation.mutate({ alertId: alert.id, data: { status: "acknowledged" } });
  };

  const resolve = (alert: LabAlert) => {
    updateMutation.mutate({ alertId: alert.id, data: { status: "resolved" } });
  };

  const openAlerts = (alerts ?? []).filter((alert) => alert.status !== "resolved").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Alerts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${openAlerts} open / ${alerts?.length ?? 0} total`}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : alerts && alerts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Alert</TableHead>
                  <TableHead>Computer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell>
                      <SeverityBadge severity={alert.severity} />
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{alert.title}</p>
                      <p className="max-w-md truncate text-xs text-muted-foreground">
                        {alert.detail}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{alert.computerName || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <AlertStatusBadge status={alert.status} />
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground tabular-nums">
                        {timeAgo(alert.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {alert.status === "open" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={updateMutation.isPending}
                            onClick={() => acknowledge(alert)}
                          >
                            <CheckCheck className="size-4" />
                            Acknowledge
                          </Button>
                        )}
                        {alert.status !== "resolved" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={updateMutation.isPending}
                            onClick={() => resolve(alert)}
                          >
                            <CheckCircle2 className="size-4" />
                            Resolve
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty className="border-0">
              <EmptyHeader>
                <EmptyMedia>
                  <AlertTriangle className="size-5" />
                </EmptyMedia>
                <EmptyTitle>No alerts</EmptyTitle>
                <EmptyDescription>
                  When something needs attention — failed logins, USB policy violations, or
                  hardware issues — it will show up here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Alerts;
