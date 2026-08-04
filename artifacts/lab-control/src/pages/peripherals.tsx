import { useMemo, useState } from "react";
import { getPeripheralsQueryKey, type Peripheral, type PeripheralKind, useGetPeripherals } from "@workspace/api-client-react";
import { Cable, Keyboard, Monitor, MousePointer2, Plug, Search, Unplug } from "lucide-react";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

const KIND_FILTERS = ["all", "keyboard", "mouse", "monitor"] as const;
const STATUS_FILTERS = ["all", "connected", "missing"] as const;

const KIND_LABEL: Record<PeripheralKind, string> = {
  keyboard: "Keyboard",
  mouse: "Mouse",
  monitor: "Monitor",
  display: "Display",
  other: "Other",
};

const KIND_ICON: Record<PeripheralKind, typeof Keyboard> = {
  keyboard: Keyboard,
  mouse: MousePointer2,
  monitor: Monitor,
  display: Monitor,
  other: Cable,
};

function PeripheralStatusBadge({ present }: { present: boolean }) {
  return present ? (
    <Badge variant="success">
      <Plug className="size-3" />
      Connected
    </Badge>
  ) : (
    <Badge variant="destructive">
      <Unplug className="size-3" />
      Missing
    </Badge>
  );
}

function Peripherals() {
  const { data: peripherals, isLoading } = useGetPeripherals(undefined, {
    query: { queryKey: getPeripheralsQueryKey(), refetchInterval: 15_000 },
  });

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<(typeof KIND_FILTERS)[number]>("all");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (peripherals ?? []).filter((peripheral) => {
      const matchesKind = kindFilter === "all" || peripheral.kind === kindFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "connected" ? peripheral.present : !peripheral.present);
      const matchesSearch =
        term.length === 0 ||
        peripheral.name.toLowerCase().includes(term) ||
        peripheral.computerName.toLowerCase().includes(term);
      return matchesKind && matchesStatus && matchesSearch;
    });
  }, [peripherals, search, kindFilter, statusFilter]);

  const missingCount = (peripherals ?? []).filter((peripheral) => !peripheral.present).length;
  const connectedCount = (peripherals ?? []).length - missingCount;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Peripherals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Keyboard, mouse, and monitor inventory reported by each client agent. Missing devices
          trigger an on-screen warning on the PC and an alert here.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Tracked devices</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{peripherals?.length ?? "—"}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Connected</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600 tabular-nums">{connectedCount}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Missing</p>
          <p className="mt-1 text-2xl font-bold text-destructive tabular-nums">{missingCount}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative sm:w-72">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by device or computer…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={kindFilter} onValueChange={(value) => setKindFilter(value as (typeof KIND_FILTERS)[number])}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Kind" />
          </SelectTrigger>
          <SelectContent>
            {KIND_FILTERS.map((kind) => (
              <SelectItem key={kind} value={kind} className="capitalize">
                {kind === "all" ? "All kinds" : KIND_LABEL[kind as PeripheralKind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as (typeof STATUS_FILTERS)[number])}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((status) => (
              <SelectItem key={status} value={status} className="capitalize">
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia>
                <Cable className="size-5" />
              </EmptyMedia>
              <EmptyTitle>No peripherals found</EmptyTitle>
              <EmptyDescription>
                {search || kindFilter !== "all" || statusFilter !== "all"
                  ? "Try adjusting your search or filters."
                  : "Peripherals appear once a client agent reports its first device inventory."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Computer</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>First seen</TableHead>
                <TableHead>Last changed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((peripheral) => {
                const KindIcon = KIND_ICON[peripheral.kind] ?? Cable;
                return (
                  <TableRow key={peripheral.id}>
                    <TableCell className="font-medium">{peripheral.computerName}</TableCell>
                    <TableCell>
                      <span className={cn("flex items-center gap-2 text-muted-foreground")}>
                        <KindIcon className="size-4" />
                        {KIND_LABEL[peripheral.kind]}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-md truncate">{peripheral.name}</TableCell>
                    <TableCell>
                      <PeripheralStatusBadge present={peripheral.present} />
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDateTime(peripheral.firstSeenAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDateTime(peripheral.lastChangedAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

export default Peripherals;
