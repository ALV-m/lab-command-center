import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetComputersQueryKey,
  getGetLabSummaryQueryKey,
  getSecurityHealthCsvUrl,
  useBroadcastSecurityAction,
  useGetComputers,
} from "@workspace/api-client-react";
import { Download, ShieldCheck, ShieldHalf, ShieldOff } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/badges";
import { PrintButton } from "@/components/print-button";
import { cn } from "@/lib/utils";

function Firewall() {
  const queryClient = useQueryClient();
  const { data: computers, isLoading } = useGetComputers({
    query: { queryKey: getGetComputersQueryKey(), refetchInterval: 10_000 },
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const broadcast = useBroadcastSecurityAction({
    mutation: {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getGetComputersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetLabSummaryQueryKey() });
        toast.success(
          result.queued > 0
            ? `Queued for ${result.queued} computer(s).`
            : "No computers with agents to act on.",
        );
      },
      onError: (error) => toast.error(error.message),
    },
  });

  const toggleSelected = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    const all = new Set((computers ?? []).map((computer) => computer.id));
    setSelected((prev) => (prev.size === all.size && all.size > 0 ? new Set() : all));
  };

  const setFirewall = (enabled: boolean) => {
    const ids = selected.size > 0 ? Array.from(selected) : undefined;
    broadcast.mutate({
      data: { action: enabled ? "fw_enable" : "fw_disable", initiatedBy: "Lab administrator", computerIds: ids },
    });
  };

  const enabledCount = (computers ?? []).filter((computer) => computer.firewallEnabled === true).length;
  const allSelected = computers != null && computers.length > 0 && selected.size === computers.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Firewall</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Firewall state on every PC, with enable/disable from here.
          </p>
        </div>
        <div className="no-print flex items-center gap-2">
          <PrintButton />
          <Button variant="outline" onClick={() => window.open(getSecurityHealthCsvUrl(), "_blank")}>
            <Download className="size-4" />
            Health CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Computers</CardDescription>
            <CardTitle className="text-2xl">{computers?.length ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Firewall enabled</CardDescription>
            <CardTitle className="text-2xl">
              {computers ? `${enabledCount}/${computers.length}` : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Firewall disabled</CardDescription>
            <CardTitle className="text-2xl">
              {computers ? `${computers.length - enabledCount}` : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldHalf className="size-4" />
            Live firewall health
          </CardTitle>
          <CardDescription>
            Enables or disables Windows Firewall on all PCs, or only the ones you select.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="no-print flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={broadcast.isPending}
              onClick={() => setFirewall(true)}
            >
              {broadcast.isPending ? <Spinner className="size-4" /> : <ShieldCheck className="size-4" />}
              Enable firewall{selected.size > 0 ? ` (${selected.size})` : " all"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={broadcast.isPending}
              onClick={() => setFirewall(false)}
            >
              <ShieldOff className="size-4" />
              Disable firewall{selected.size > 0 ? ` (${selected.size})` : " all"}
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              {selected.size > 0 ? `${selected.size} selected` : "No selection — applies to all"}
            </span>
          </div>

          <div className="rounded-lg border">
            {isLoading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : !computers || computers.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia>
                    <ShieldHalf className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>No computers yet</EmptyTitle>
                  <EmptyDescription>
                    PCs that install the agent will appear here with their firewall status.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all computers"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="size-4 accent-primary"
                      />
                    </TableHead>
                    <TableHead>Computer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Firewall</TableHead>
                    <TableHead>Profiles</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {computers.map((computer) => {
                    const firewallEnabled = computer.firewallEnabled === true;
                    return (
                      <TableRow key={computer.id} className={cn(selected.has(computer.id) && "bg-accent/50")}>
                        <TableCell>
                          <input
                            type="checkbox"
                            aria-label={`Select ${computer.name}`}
                            checked={selected.has(computer.id)}
                            onChange={() => toggleSelected(computer.id)}
                            className="size-4 accent-primary"
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{computer.name}</p>
                            <p className="text-xs text-muted-foreground">{computer.room}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={computer.status} />
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              computer.firewallEnabled === false
                                ? "destructive"
                                : computer.firewallEnabled === true
                                  ? "success"
                                  : "secondary"
                            }
                          >
                            {computer.firewallEnabled == null
                              ? "Unknown"
                              : computer.firewallEnabled
                                ? "Enabled"
                                : "Disabled"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{computer.firewallProfiles || "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={broadcast.isPending || firewallEnabled}
                              onClick={() =>
                                broadcast.mutate({
                                  data: {
                                    action: "fw_enable",
                                    initiatedBy: "Lab administrator",
                                    computerIds: [computer.id],
                                  },
                                })
                              }
                              title="Enable firewall"
                            >
                              <ShieldCheck className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={broadcast.isPending || !firewallEnabled}
                              onClick={() =>
                                broadcast.mutate({
                                  data: {
                                    action: "fw_disable",
                                    initiatedBy: "Lab administrator",
                                    computerIds: [computer.id],
                                  },
                                })
                              }
                              title="Disable firewall"
                            >
                              <ShieldOff className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default Firewall;
