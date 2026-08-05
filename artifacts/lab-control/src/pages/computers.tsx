import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ComputerActionInputAction,
  getGetComputersQueryKey,
  getGetLabSummaryQueryKey,
  getLatestScreenshotQueryKey,
  screenshotFileUrl,
  type Computer,
  type UsbMode,
  useCreateComputerAction,
  useGetComputers,
  useGetLatestScreenshot,
  usePushFileToComputer,
  useSetComputerUsbMode,
} from "@workspace/api-client-react";
import {
  Ban,
  Camera,
  ChevronDown,
  FileUp,
  Lock,
  Monitor,
  MonitorPlay,
  MoreHorizontal,
  MousePointer2,
  Radar,
  RefreshCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
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
import { formatDateTime, timeAgo } from "@/lib/format";
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
  const [fileTarget, setFileTarget] = useState<Computer | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Computer | null>(null);
  const [deletePath, setDeletePath] = useState("");
  const [securityTarget, setSecurityTarget] = useState<Computer | null>(null);
  const [viewTarget, setViewTarget] = useState<Computer | null>(null);

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

  const usbModeMutation = useSetComputerUsbMode({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetComputersQueryKey() });
        toast.success("USB mode updated");
      },
      onError: (error) => toast.error(error.message),
    },
  });

  const fileMutation = usePushFileToComputer({
    mutation: {
      onSuccess: (result) => {
        setFileTarget(null);
        setSelectedFile(null);
        toast.success(`Queued "${result.fileName}" for delivery`);
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

  const runAction = (computer: Computer, action: ComputerActionInputAction, payload?: string) => {
    actionMutation.mutate({ computerId: computer.id, data: { action, payload } });
  };

  const setUsbMode = (computer: Computer, mode: UsbMode) => {
    usbModeMutation.mutate({ computerId: computer.id, mode });
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

  const sendFile = () => {
    if (!fileTarget || !selectedFile) return;
    fileMutation.mutate({ computerId: fileTarget.id, file: selectedFile });
  };

  const confirmDelete = () => {
    if (!deleteTarget || deletePath.trim().length === 0) return;
    runAction(
      deleteTarget,
      ComputerActionInputAction.delete_file,
      JSON.stringify({ path: deletePath.trim() }),
    );
    setDeleteTarget(null);
    setDeletePath("");
  };

  const securityBusy = actionMutation.isPending;
  const avEnabled = securityTarget?.avEnabled;
  const firewallEnabled = securityTarget?.firewallEnabled;
  const firewallProfiles = securityTarget?.firewallProfiles;

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
                          onClick={() => setViewTarget(computer)}
                        >
                          <MousePointer2 className="size-4" />
                          Remote view
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={actionMutation.isPending}
                          onClick={() => runAction(computer, ComputerActionInputAction.remote_control)}
                        >
                          <MonitorPlay className="size-4" />
                          Remote control (RDP)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={actionMutation.isPending}
                          onClick={() => runAction(computer, ComputerActionInputAction.av_scan)}
                        >
                          <Radar className="size-4" />
                          Run antivirus scan
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={actionMutation.isPending}
                          onClick={() => setSecurityTarget(computer)}
                        >
                          <ShieldAlert className="size-4" />
                          Security…
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={fileMutation.isPending}
                          onClick={() => setFileTarget(computer)}
                        >
                          <FileUp className="size-4" />
                          Push file…
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={actionMutation.isPending}
                          onClick={() => {
                            setDeleteTarget(computer);
                            setDeletePath("");
                          }}
                        >
                          <Trash2 className="size-4" />
                          Delete file…
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={usbModeMutation.isPending}
                          onClick={() => setUsbMode(computer, "allowed")}
                        >
                          <ShieldCheck className="size-4" />
                          USB: allow devices
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={usbModeMutation.isPending}
                          onClick={() => setUsbMode(computer, "blocked")}
                        >
                          <Ban className="size-4" />
                          USB: block devices
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={usbModeMutation.isPending}
                          onClick={() => setUsbMode(computer, "review")}
                        >
                          <ShieldAlert className="size-4" />
                          USB: review / quarantine
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={actionMutation.isPending}
                          onClick={() => runAction(computer, ComputerActionInputAction.block_usb)}
                        >
                          <Ban className="size-4" />
                          Eject removable drives
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={actionMutation.isPending}
                          onClick={() => runAction(computer, ComputerActionInputAction.allow_usb)}
                        >
                          <ShieldCheck className="size-4" />
                          Allow all USB (policy)
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

      <Dialog open={fileTarget !== null} onOpenChange={(open) => !open && setFileTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Push file to {fileTarget?.name}</DialogTitle>
            <DialogDescription>
              The file is uploaded to the server and delivered to the target computer's Downloads
              folder when its agent checks in.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="file"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFileTarget(null)}>
              Cancel
            </Button>
            <Button onClick={sendFile} disabled={!selectedFile || fileMutation.isPending}>
              {fileMutation.isPending ? <Spinner className="size-4" /> : <FileUp className="size-4" />}
              Queue file
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete file on {deleteTarget?.name}</DialogTitle>
            <DialogDescription>
              Enter the full path of the file or folder on the client PC to remove.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="C:\Users\student\Downloads\example.exe"
            value={deletePath}
            onChange={(event) => setDeletePath(event.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deletePath.trim().length === 0 || actionMutation.isPending}>
              <Trash2 className="size-4" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={securityTarget !== null} onOpenChange={(open) => !open && setSecurityTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Security on {securityTarget?.name}</DialogTitle>
            <DialogDescription>
              Antivirus and firewall status and controls. Actions are delivered to the agent on its
              next check-in.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="size-4 text-amber-500" />
                  <p className="font-medium">Windows Defender</p>
                </div>
                <Badge variant={avEnabled === false ? "destructive" : "default"}>
                  {avEnabled == null ? "Unknown" : avEnabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <dl className="mt-3 space-y-1 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <dt>Definitions</dt>
                  <dd className="tabular-nums">{securityTarget?.avSignature || "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Last scan</dt>
                  <dd className="tabular-nums">{formatDateTime(securityTarget?.avLastScanAt)}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={securityBusy}
                  onClick={() => securityTarget && runAction(securityTarget, ComputerActionInputAction.av_scan)}
                >
                  <Radar className="size-4" />
                  Quick scan
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={securityBusy}
                  onClick={() =>
                    securityTarget &&
                    runAction(
                      securityTarget,
                      ComputerActionInputAction.av_scan,
                      JSON.stringify({ type: "full" }),
                    )
                  }
                >
                  <Radar className="size-4" />
                  Full scan
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={securityBusy}
                  onClick={() => securityTarget && runAction(securityTarget, ComputerActionInputAction.av_update)}
                >
                  <RefreshCcw className="size-4" />
                  Update definitions
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={securityBusy || avEnabled == null}
                  onClick={() =>
                    securityTarget &&
                    runAction(
                      securityTarget,
                      ComputerActionInputAction.av_toggle,
                      JSON.stringify({ enabled: !avEnabled }),
                    )
                  }
                >
                  {avEnabled ? <Ban className="size-4" /> : <ShieldCheck className="size-4" />}
                  {avEnabled ? "Disable protection" : "Enable protection"}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-emerald-500" />
                  <p className="font-medium">Windows Firewall</p>
                </div>
                <Badge variant={firewallEnabled === false ? "destructive" : "default"}>
                  {firewallEnabled == null ? "Unknown" : firewallEnabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{firewallProfiles || "No profile data reported yet."}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={securityBusy}
                  onClick={() => securityTarget && runAction(securityTarget, ComputerActionInputAction.fw_enable)}
                >
                  <ShieldCheck className="size-4" />
                  Enable firewall
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={securityBusy}
                  onClick={() => securityTarget && runAction(securityTarget, ComputerActionInputAction.fw_disable)}
                >
                  <Ban className="size-4" />
                  Disable firewall
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSecurityTarget(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {viewTarget ? (
        <RemoteViewDialog
          computer={viewTarget}
          open
          onOpenChange={(open) => !open && setViewTarget(null)}
        />
      ) : null}
    </div>
  );
}

function RemoteViewDialog({
  computer,
  open,
  onOpenChange,
}: {
  computer: Computer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data, isFetching } = useGetLatestScreenshot(computer.id, {
    query: {
      queryKey: getLatestScreenshotQueryKey(computer.id),
      refetchInterval: open ? 5_000 : false,
    },
  });

  const captureMutation = useCreateComputerAction({
    mutation: {
      onSuccess: () => {
        toast.success("Screenshot requested");
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: getLatestScreenshotQueryKey(computer.id) });
        }, 6_000);
      },
      onError: (error) => toast.error(error.message),
    },
  });

  const shot = data?.screenshot;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>Remote view — {computer.name}</DialogTitle>
        <DialogDescription>
          {shot
            ? `Latest screen capture from ${formatDateTime(shot.takenAt)}.`
            : "No screenshot available yet. Request one below."}
        </DialogDescription>
      </DialogHeader>
      <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-muted">
        {shot ? (
          <img
            src={screenshotFileUrl(shot.fileId)}
            alt={`Screenshot of ${computer.name}`}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            {isFetching ? <Spinner className="size-4" /> : <Monitor className="size-4" />}
            {isFetching ? "Checking for a screenshot…" : "No screenshot yet. Request one below."}
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
        <Button
          disabled={captureMutation.isPending}
          onClick={() =>
            captureMutation.mutate({
              computerId: computer.id,
              data: { action: ComputerActionInputAction.remote_view },
            })
          }
        >
          {captureMutation.isPending ? <Spinner className="size-4" /> : <Camera className="size-4" />}
          Capture fresh view
        </Button>
      </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default Computers;
