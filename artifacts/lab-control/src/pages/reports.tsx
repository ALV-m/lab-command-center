import { useState } from "react";
import {
  getAttendanceCsvUrl,
  getViolationsCsvUrl,
  useGetAttendanceReport,
  useGetViolationsReport,
} from "@workspace/api-client-react";
import { Download, FileText, ShieldAlert, Users } from "lucide-react";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

const RANGES = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 0, label: "All time" },
];

function formatDuration(minutes: number | null): string {
  if (minutes == null) return "—";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function ReportCard({
  title,
  description,
  onDownload,
  children,
}: {
  title: string;
  description: string;
  onDownload: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button variant="outline" onClick={onDownload}>
        <Download className="size-4" />
        CSV
      </Button>
    </div>
  );
}

function Reports() {
  const [tab, setTab] = useState<"attendance" | "violations">("attendance");
  const [days, setDays] = useState(7);

  const attendance = useGetAttendanceReport(days, {
    query: { queryKey: ["attendance", days], refetchInterval: 30_000 },
  });
  const violations = useGetViolationsReport(days, {
    query: { queryKey: ["violations", days], refetchInterval: 30_000 },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Attendance and policy violation summaries with CSV export.
          </p>
        </div>
        <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Time range" />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((range) => (
              <SelectItem key={range.value} value={String(range.value)}>
                {range.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-1 rounded-lg border p-1 w-fit">
        {(
          [
            { key: "attendance", label: "Attendance", icon: Users },
            { key: "violations", label: "Violations", icon: ShieldAlert },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === item.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </button>
        ))}
      </div>

      {tab === "attendance" ? (
        <div className="space-y-4">
          <ReportCard
            title="Attendance"
            description="Student sign-in and sign-out records per computer."
            onDownload={() => {
              window.open(getAttendanceCsvUrl(days), "_blank");
            }}
          />
          <div className="rounded-lg border">
            {attendance.isLoading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : (attendance.data ?? []).length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia>
                    <FileText className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>No attendance records</EmptyTitle>
                  <EmptyDescription>
                    Sessions recorded by the client agent or sign-in form will appear here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Computer</TableHead>
                    <TableHead>Sign in</TableHead>
                    <TableHead>Sign out</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(attendance.data ?? []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.studentName}</TableCell>
                      <TableCell className="text-muted-foreground">{row.studentId}</TableCell>
                      <TableCell>{row.computerName}</TableCell>
                      <TableCell className="tabular-nums">{formatDateTime(row.startedAt)}</TableCell>
                      <TableCell className="tabular-nums">{formatDateTime(row.endedAt)}</TableCell>
                      <TableCell className="tabular-nums">{formatDuration(row.durationMinutes)}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "active" ? "default" : "secondary"}>
                          {row.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <ReportCard
            title="Violations"
            description="Blocked USB devices, unexpected device connections, and failed logins."
            onDownload={() => {
              window.open(getViolationsCsvUrl(days), "_blank");
            }}
          />
          <div className="rounded-lg border">
            {violations.isLoading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : (violations.data ?? []).length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia>
                    <ShieldAlert className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>No violations</EmptyTitle>
                  <EmptyDescription>
                    USB blocks, device connections, and failed logins will appear here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Computer</TableHead>
                    <TableHead>Actor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(violations.data ?? []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="tabular-nums">{formatDateTime(row.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant="destructive">{row.type.replaceAll("_", " ")}</Badge>
                      </TableCell>
                      <TableCell className="max-w-md truncate">{row.message}</TableCell>
                      <TableCell>{row.computerName ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{row.actor}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Reports;
