import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ComputerActionInputAction,
  getGetComputersQueryKey,
  getGetLabSummaryQueryKey,
  type Computer,
  useCreateComputerAction,
  useGetComputers,
} from "@workspace/api-client-react";
import {
  Ban,
  ChevronDown,
  Lock,
  Monitor,
  MoreHorizontal,
  MousePointer2,
  RefreshCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, UsbBadge } from "@/components/badges";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = ["all", "online", "offline", "warning", "locked"] as const;

function Computers() {
  const queryClient = useQueryClient();
  const { data: computers, isLoading } = useGetComputers({
    query: { queryKey: getGetComputersQueryKey(), refetchInterval: 10_000 },
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [messageTarget, setMessageTarget] = useState<Computer | null>(null);
  const [message, setMessage] = useState("");

  const actionMutation = useCreateComputerAction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetComputersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetLabSummaryQueryKey() });
        toast.success("Action queued");
      },
      onError: (error) => toast.error(error.message),
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (computers ?? []).filter((computer) => {
      const matchesStatus = statusFilter === "all" || computer.status === statusFilter;
      const matchesSearch =
        term.length === 0 ||
        computer.name.toLowerCase().includes(term) ||
        computer.room.toLowerCase().includes(term) ||
        (computer.userName ?? "").toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [computers, search, statusFilter]);

  const runAction = (computer: Computer, action: ComputerActionInputAction) => {
    actionMutation.mutate({ computerId: computer.id, data: { action } });
  };

  const sendMessage = () => {
    if (!messageTarget || message.trim().length === 0) return;
    actionMutation.mutate(
      {
        computerId: messageTarget.id,
        data: { action: ComputerActionInputAction.send_message, message: message.trim() },
      },
      {
        onSuccess: () => {
          setMessageTarget(null);
          setMessage("");
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Computers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${filtered.length} of ${computers?.length ?? 0} computers`}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative sm:w-72">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, room, or user…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
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
                <Monitor className="size-5" />
              </EmptyMedia>
              <EmptyTitle>No computers found</EmptyTitle>
              <EmptyDescription>
                {search || statusFilter !== "all"
                  ? "Try adjusting your search or filters."
                  : "No computers have reported to the lab yet."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Computer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>User</TableHead>
                <TableHead>USB</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((computer) => (
                <TableRow key={computer.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex size-8 items-center justify-center rounded-md",
                          computer.status === "online" && "bg-emerald-500/10 text-emerald-600",
                          computer.status === "offline" && "bg-muted text-muted-foreground",
                          computer.status === "warning" && "bg-amber-500/10 text-amber-600",
                          computer.status === "locked" && "bg-destructive/10 text-destructive",
                        )}
                      >
                        <Monitor className="size-4" />
                      </div>
                      <div>
                        <p className="font-medium">{computer.name}</p>
                        <p className="text-xs text-muted-foreground">{computer.room}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={computer.status} />
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">{computer.userName || "—"}</span>
                  </TableCell>
                  <TableCell>
                    <UsbBadge state={computer.usbState} />
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground tabular-nums">
                      {timeAgo(computer.lastSeen)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${computer.name}`}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel>{computer.name}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={actionMutation.isPending}
                          onClick={() => runAction(computer, ComputerActionInputAction.lock)}
                        >
                          <Lock className="size-4" />
                          Lock
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={actionMutation.isPending}
                          onClick={() => runAction(computer, ComputerActionInputAction.unlock)}
                        >
                          <Unlock className="size-4" />
                          Unlock
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={actionMutation.isPending}
                          onClick={() => runAction(computer, ComputerActionInputAction.restart)}
                        >
                          <RefreshCcw className="size-4" />
                          Restart
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={actionMutation.isPending}
                          onClick={() => runAction(computer, ComputerActionInputAction.wake)}
                        >
                          <Zap className="size-4" />
                          Wake on LAN
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={actionMutation.isPending}
                          onClick={() => setMessageTarget(computer)}
                        >
                          <Send className="size-4" />
                          Send message…
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={actionMutation.isPending}
                          onClick={() => runAction(computer, ComputerActionInputAction.remote_view)}
                        >
                          <MousePointer2 className="size-4" />
                          Remote view
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={actionMutation.isPending}
                          onClick={() => runAction(computer, ComputerActionInputAction.block_usb)}
                        >
                          <Ban className="size-4" />
                          Block USB
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={actionMutation.isPending}
                          onClick={() => runAction(computer, ComputerActionInputAction.allow_usb)}
                        >
                          <ShieldCheck className="size-4" />
                          Allow USB
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={messageTarget !== null} onOpenChange={(open) => !open && setMessageTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send message to {messageTarget?.name}</DialogTitle>
            <DialogDescription>
              The message will appear on the target computer's screen.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Type your message…"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMessageTarget(null)}>
              Cancel
            </Button>
            <Button onClick={sendMessage} disabled={message.trim().length === 0 || actionMutation.isPending}>
              {actionMutation.isPending ? <Spinner className="size-4" /> : <Send className="size-4" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Computers;
