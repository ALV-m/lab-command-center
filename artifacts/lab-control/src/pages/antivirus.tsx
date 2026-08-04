import { Fragment, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetComputersQueryKey,
  getGetLabSummaryQueryKey,
  getScanReportQueryKey,
  getScansCsvUrl,
  getSecurityHealthCsvUrl,
  type Computer,
  useBroadcastSecurityAction,
  useGetComputers,
  useGetScanReport,
} from "@workspace/api-client-react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Radar,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/badges";
import { PrintButton } from "@/components/print-button";
import { formatDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const SCAN_RANGES = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 0, label: "All time" },
];

function scanActionLabel(action: string): string {
  if (action.startsWith("av_scan:")) {
    return action.endsWith(":full") ? "Full scan" : "Quick scan";
  }
  return action === "av_update" ? "Definitions update" : action.replaceAll("_", " ");
}

function statusVariant(
  status: string,
): "default" | "success" | "warning" | "destructive" | "secondary" {
  switch (status) {
    case "completed":
      return "success";
    case "completed_with_errors":
      return "warning";
    case "failed":
      return "destructive";
    case "queued":
      return "secondary";
    default:
      return "warning";
  }
}

function Antivirus() {
  const queryClient = useQueryClient();
  const { data: computers, isLoading } = useGetComputers({
    query: { queryKey: getGetComputersQueryKey(), refetchInterval: 10_000 },
  });
  const [days, setDays] = useState(7);
  const scans = useGetScanReport(days, {
    query: { queryKey: getScanReportQueryKey(days), refetchInterval: 15_000 },
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expandedRun, setExpandedRun] = useState<number | null>(null);

  const broadcast = useBroadcastSecurityAction({
    mutation: {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getGetComputersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getScanReportQueryKey(days) });
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

  const runBroadcast = (action: "av_scan" | "av_update", type?: "quick" | "full") => {
    const ids = selected.size > 0 ? Array.from(selected) : undefined;
    broadcast.mutate({ data: { action, type, initiatedBy: "Lab administrator", computerIds: ids } });
  };

  const runningCount = (computers ?? []).filter((computer) => computer.avScanState === "scanning").length;
  const protectedCount = (computers ?? []).filter((computer) => computer.avEnabled === true).length;
  const allSelected = computers != null && computers.length > 0 && selected.size === computers.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Antivirus</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Health of every PC, on-demand scans, and scan history.
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
            <CardDescription>Protection enabled</CardDescription>
            <CardTitle className="text-2xl">
              {computers ? `${protectedCount}/${computers.length}` : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Scanning now</CardDescription>
            <CardTitle className="text-2xl">{runningCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4" />
            Live PC health
          </CardTitle>
          <CardDescription>
            Runs scans or definition updates on all PCs, or only the ones you select.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="no-print flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={broadcast.isPending}
              onClick={() => runBroadcast("av_scan", "quick")}
            >
              {broadcast.isPending ? <Spinner className="size-4" /> : <Radar className="size-4" />}
              Quick scan{selected.size > 0 ? ` (${selected.size})` : " all"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={broadcast.isPending}
              onClick={() => runBroadcast("av_scan", "full")}
            >
              <Radar className="size-4" />
              Full scan{selected.size > 0 ? ` (${selected.size})` : " all"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={broadcast.isPending}
              onClick={() => runBroadcast("av_update")}
            >
              <RefreshCcw className="size-4" />
              Update definitions{selected.size > 0 ? ` (${selected.size})` : " all"}
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
                    <ShieldAlert className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>No computers yet</EmptyTitle>
                  <EmptyDescription>
                    PCs that install the agent will appear here with their antivirus status.
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
                    <TableHead>Antivirus</TableHead>
                    <TableHead>Definitions</TableHead>
                    <TableHead>Last scan</TableHead>
                    <TableHead>Scan state</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {computers.map((computer) => (
                    <ComputerRow
                      key={computer.id}
                      computer={computer}
                      selected={selected.has(computer.id)}
                      busy={broadcast.isPending}
                      onToggle={() => toggleSelected(computer.id)}
                      onAction={(action, payload) =>
                        broadcast.mutate({
                          data: { action, ...payload, initiatedBy: "Lab administrator", computerIds: [computer.id] },
                        })
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Radar className="size-4" />
              Scan history
            </CardTitle>
            <CardDescription>Scan and definition-update runs requested by the admin.</CardDescription>
          </div>
          <div className="no-print flex items-center gap-2">
            <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Time range" />
              </SelectTrigger>
              <SelectContent>
                {SCAN_RANGES.map((range) => (
                  <SelectItem key={range.value} value={String(range.value)}>
                    {range.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => window.open(getScansCsvUrl(days), "_blank")}>
              <Download className="size-4" />
              CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {scans.isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : !scans.data || scans.data.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia>
                  <Radar className="size-5" />
                </EmptyMedia>
                <EmptyTitle>No scans yet</EmptyTitle>
                <EmptyDescription>
                  Quick/full scans and definition updates requested from this page will appear here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Requested</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Initiated by</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scans.data.map((run) => {
                  const finished = run.results.filter(
                    (r) => r.status === "completed" || r.status === "failed",
                  ).length;
                  const failed = run.results.filter((r) => r.status === "failed").length;
                  const expanded = expandedRun === run.id;
                  return (
                    <Fragment key={run.id}>
                      <TableRow>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => setExpandedRun(expanded ? null : run.id)}
                            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                            aria-label="Toggle details"
                          >
                            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </button>
                        </TableCell>
                        <TableCell className="tabular-nums">{formatDateTime(run.requestedAt)}</TableCell>
                        <TableCell>{scanActionLabel(run.action)}</TableCell>
                        <TableCell className="text-muted-foreground">{run.initiatedBy}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(run.status)}>{run.status.replaceAll("_", " ")}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {run.results.length === 0
                            ? "—"
                            : `${finished}/${run.results.length} finished${failed > 0 ? `, ${failed} failed` : ""}`}
                        </TableCell>
                      </TableRow>
                      {expanded && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/40 p-3">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Computer</TableHead>
                                  <TableHead>Result</TableHead>
                                  <TableHead>Details</TableHead>
                                  <TableHead>Finished</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {run.results.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={4} className="text-muted-foreground">
                                      No per-computer results recorded.
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  run.results.map((result) => (
                                    <TableRow key={result.id}>
                                      <TableCell className="font-medium">{result.computerName}</TableCell>
                                      <TableCell>
                                        <Badge variant={statusVariant(result.status)}>{result.status}</Badge>
                                      </TableCell>
                                      <TableCell className="max-w-md truncate text-muted-foreground">
                                        {result.detail || "—"}
                                      </TableCell>
                                      <TableCell className="tabular-nums text-muted-foreground">
                                        {formatDateTime(result.finishedAt)}
                                      </TableCell>
                                    </TableRow>
                                  ))
                                )}
                              </TableBody>
                            </Table>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ComputerRow({
  computer,
  selected,
  busy,
  onToggle,
  onAction,
}: {
  computer: Computer;
  selected: boolean;
  busy: boolean;
  onToggle: () => void;
  onAction: (
    action: "av_scan" | "av_update" | "av_toggle",
    payload?: { type?: "quick" | "full"; enabled?: boolean },
  ) => void;
}) {
  return (
    <TableRow className={cn(selected && "bg-accent/50")}>
      <TableCell>
        <input
          type="checkbox"
          aria-label={`Select ${computer.name}`}
          checked={selected}
          onChange={onToggle}
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
            computer.avEnabled === false
              ? "destructive"
              : computer.avEnabled === true
                ? "success"
                : "secondary"
          }
        >
          {computer.avEnabled == null ? "Unknown" : computer.avEnabled ? "Enabled" : "Disabled"}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">{computer.avSignature || "—"}</TableCell>
      <TableCell className="text-muted-foreground tabular-nums">
        {computer.avLastScanAt ? `${timeAgo(computer.avLastScanAt)} · ${formatDateTime(computer.avLastScanAt)}` : "Never"}
      </TableCell>
      <TableCell>
        <Badge variant={computer.avScanState === "scanning" ? "warning" : "secondary"}>
          {computer.avScanState === "scanning" ? "Scanning" : "Idle"}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onAction("av_scan", { type: "quick" })}
            title="Quick scan"
          >
            <Radar className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onAction("av_scan", { type: "full" })}
            title="Full scan"
          >
            <ShieldAlert className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onAction("av_update")}
            title="Update definitions"
          >
            <RefreshCcw className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onAction("av_toggle", { enabled: !computer.avEnabled })}
            title={computer.avEnabled === false ? "Enable protection" : "Disable protection"}
          >
            {computer.avEnabled === false ? (
              <ShieldCheck className="size-4" />
            ) : (
              <ShieldOff className="size-4" />
            )}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default Antivirus;
