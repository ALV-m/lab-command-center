import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  resolveTenantSlug,
  useGetComputers,
  useGetLabAlerts,
  useGetLabSummary,
} from "@workspace/api-client-react";
import { AlertTriangle, Check, Copy, Monitor, ShieldAlert, Terminal, Users, Wifi } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as ReTooltip } from "recharts";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertStatusBadge, SeverityBadge, StatusBadge } from "@/components/badges";
import { timeAgo } from "@/lib/format";

const STATUS_COLORS: Record<string, string> = {
  online: "#22c55e",
  offline: "#94a3b8",
  warning: "#f59e0b",
  locked: "#ef4444",
};

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: typeof Monitor;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-6">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
        </div>
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function SummarySkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-28 w-full" />
      ))}
    </div>
  );
}

function CopyCommand({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(children);
    setCopied(true);
    toast.success("Command copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative rounded-lg bg-muted p-4 pr-12 font-mono text-sm">
      <pre className="whitespace-pre-wrap break-all">{children}</pre>
      <button
        type="button"
        onClick={copy}
        className="absolute top-3 right-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Copy command"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

function Dashboard() {
  const { data: summary, isLoading } = useGetLabSummary();
  const { data: computers, isLoading: computersLoading } = useGetComputers();
  const { data: alerts } = useGetLabAlerts();

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const slug = resolveTenantSlug() ?? "";
  const serverUrl = `${origin}/t/${slug}`;
  const installCmd = `$s='${serverUrl}'; iwr "$s/api/agent/download" -OutFile "$env:TEMP\\lab-agent.ps1"; powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\\lab-agent.ps1" -ServerUrl $s -Install`;

  const statusData = useMemo(() => {
    const counts: Record<string, number> = { online: 0, offline: 0, warning: 0, locked: 0 };
    for (const computer of computers ?? []) {
      counts[computer.status] = (counts[computer.status] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .filter((entry) => entry.value > 0);
  }, [computers]);

  const recentAlerts = useMemo(() => (alerts ?? []).slice(0, 5), [alerts]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Lab Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live status across the computer lab.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="size-4" />
            Install agent on a lab PC
          </CardTitle>
          <CardDescription>
            Copy this one command and paste it into an Administrator PowerShell
            on each lab PC. It installs the agent as a SYSTEM boot task that
            covers every user.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CopyCommand>{installCmd}</CopyCommand>
        </CardContent>
      </Card>

      {isLoading ? (
        <SummarySkeleton />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Computers" value={summary?.totalComputers ?? 0} icon={Monitor} />
          <StatCard label="Online" value={summary?.onlineComputers ?? 0} icon={Wifi} />
          <StatCard label="Active Sessions" value={summary?.activeSessions ?? 0} icon={Users} />
          <StatCard label="Open Alerts" value={summary?.openAlerts ?? 0} icon={AlertTriangle} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Computer Status</CardTitle>
            <CardDescription>Distribution of machines by status.</CardDescription>
          </CardHeader>
          <CardContent>
            {computersLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : statusData.length === 0 ? (
              <Empty variant="ghost">
                <EmptyHeader>
                  <EmptyMedia>
                    <Monitor className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>No computers yet</EmptyTitle>
                  <EmptyDescription>
                    Computers will appear here once they report in to the lab.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                        strokeWidth={2}
                      >
                        {statusData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={STATUS_COLORS[entry.name] ?? "#94a3b8"}
                          />
                        ))}
                      </Pie>
                      <ReTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                  {statusData.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-1.5 text-sm">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: STATUS_COLORS[entry.name] ?? "#94a3b8" }}
                      />
                      <span className="capitalize text-muted-foreground">{entry.name}</span>
                      <span className="font-medium tabular-nums">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              Recent Alerts
              <Link
                href="/alerts"
                className="text-sm font-normal text-muted-foreground underline-offset-4 hover:underline"
              >
                View all
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentAlerts.length === 0 ? (
              <Empty variant="ghost">
                <EmptyHeader>
                  <EmptyMedia>
                    <ShieldAlert className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>No alerts</EmptyTitle>
                  <EmptyDescription>All clear — no alerts have been raised.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="divide-y">
                {recentAlerts.map((alert) => (
                  <li key={alert.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <SeverityBadge severity={alert.severity} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{alert.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{alert.detail}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <AlertStatusBadge status={alert.status} />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {timeAgo(alert.createdAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Computers</CardTitle>
          <CardDescription>Machines currently known to the lab.</CardDescription>
        </CardHeader>
        <CardContent>
          {computersLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : computers && computers.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {computers.map((computer) => (
                <div
                  key={computer.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{computer.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {computer.userName || "Unused"} · {computer.os}
                    </p>
                  </div>
                  <StatusBadge status={computer.status} />
                </div>
              ))}
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia>
                  <Monitor className="size-5" />
                </EmptyMedia>
                <EmptyTitle>No computers connected</EmptyTitle>
                <EmptyDescription>
                  Check that lab agents are running and can reach the API.
                </EmptyDescription>
                <EmptyContent>
                  <Badge variant="outline">Last sync: {timeAgo(summary?.lastSyncAt)}</Badge>
                </EmptyContent>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Dashboard;
