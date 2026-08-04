import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetComputersQueryKey,
  getGetLabSummaryQueryKey,
  getGetUsbPoliciesQueryKey,
  getUsbDevicesQueryKey,
  type UsbPolicyMode,
  type UsbPolicyScope,
  useDecideUsbDevice,
  useGetComputers,
  useGetUsbDevices,
  useGetUsbPolicies,
  useUpdateUsbPolicy,
} from "@workspace/api-client-react";
import { Check, Save, ShieldCheck, ShieldOff, Usb, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { timeAgo, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function UsbPolicies() {
  const queryClient = useQueryClient();
  const { data: policies, isLoading } = useGetUsbPolicies();
  const { data: computers } = useGetComputers();
  const { data: usbDevices } = useGetUsbDevices();

  const policy = policies?.[0];

  const [mode, setMode] = useState<UsbPolicyMode>("allowed");
  const [scope, setScope] = useState<UsbPolicyScope>("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!policy) return;
    setMode(policy.mode);
    setScope(policy.scope);
    setSelectedIds(policy.computerIds ?? []);
    setDirty(false);
  }, [policy]);

  const updateMutation = useUpdateUsbPolicy({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetUsbPoliciesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetComputersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetLabSummaryQueryKey() });
        setDirty(false);
        toast.success("USB policy saved");
      },
      onError: (error) => toast.error(error.message),
    },
  });

  const decideMutation = useDecideUsbDevice({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getUsbDevicesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetLabSummaryQueryKey() });
        toast.success("USB decision saved");
      },
      onError: (error) => toast.error(error.message),
    },
  });

  const pending = (usbDevices ?? []).filter((device) => device.status === "pending");
  const decided = (usbDevices ?? []).filter((device) => device.status !== "pending").slice(0, 10);

  const toggleComputer = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
    setDirty(true);
  };

  const save = () => {
    updateMutation.mutate({
      data: {
        mode,
        scope,
        computerIds: scope === "selected" ? selectedIds : undefined,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">USB Policy</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Control whether removable storage is allowed across the lab.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Removable media policy</CardTitle>
          <CardDescription>
            {policy
              ? `Updated ${timeAgo(policy.updatedAt)}`
              : "No policy configured yet — saving one will create the default policy."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  {mode === "allowed" ? (
                    <ShieldCheck className="size-5 text-emerald-600" />
                  ) : (
                    <ShieldOff className="size-5 text-destructive" />
                  )}
                  <div>
                    <p className="font-medium">
                      {mode === "allowed" ? "Allow USB devices" : "Block USB devices"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {mode === "allowed"
                        ? "Flash drives, phones, and other removable storage can be used."
                        : "Removable storage is blocked on affected computers."}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={mode === "allowed"}
                  onCheckedChange={(checked) => {
                    setMode(checked ? "allowed" : "blocked");
                    setDirty(true);
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label>Scope</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setScope("all");
                      setDirty(true);
                    }}
                    className={cn(
                      "rounded-lg border p-4 text-left transition-colors",
                      scope === "all"
                        ? "border-primary bg-primary/5"
                        : "hover:bg-accent",
                    )}
                  >
                    <p className="font-medium">All computers</p>
                    <p className="text-sm text-muted-foreground">
                      Apply to every computer in the lab.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScope("selected");
                      setDirty(true);
                    }}
                    className={cn(
                      "rounded-lg border p-4 text-left transition-colors",
                      scope === "selected"
                        ? "border-primary bg-primary/5"
                        : "hover:bg-accent",
                    )}
                  >
                    <p className="font-medium">Selected computers</p>
                    <p className="text-sm text-muted-foreground">
                      Pick specific machines below.
                    </p>
                  </button>
                </div>
              </div>

              {scope === "selected" && (
                <div className="space-y-2">
                  <Label>Computers</Label>
                  {computers && computers.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {computers.map((computer) => {
                        const checked = selectedIds.includes(computer.id);
                        return (
                          <label
                            key={computer.id}
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm transition-colors",
                              checked ? "border-primary bg-primary/5" : "hover:bg-accent",
                            )}
                          >
                            <Input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleComputer(computer.id)}
                              className="size-4"
                            />
                            <span className="truncate font-medium">{computer.name}</span>
                            <span className="ml-auto text-xs text-muted-foreground">
                              {computer.room}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No computers available to select.
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  onClick={save}
                  disabled={!dirty || updateMutation.isPending || (scope === "selected" && selectedIds.length === 0)}
                >
                  {updateMutation.isPending ? <Spinner className="size-4" /> : <Save className="size-4" />}
                  Save policy
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Usb className="size-4" />
            USB device approvals
          </CardTitle>
          <CardDescription>
            Removable devices the agent detected are scanned and held until approved. Ejected when
            blocked.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {pending.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Awaiting review ({pending.length})</p>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Computer</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Detected</TableHead>
                      <TableHead>Scan</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((device) => (
                      <TableRow key={device.id}>
                        <TableCell className="font-medium">{device.computerName}</TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">
                            {device.driveLetter ? `${device.driveLetter}: ` : ""}
                          </span>
                          {device.label ?? "Removable device"}
                          {device.deviceId ? (
                            <span className="block text-xs text-muted-foreground">{device.deviceId}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {timeAgo(device.createdAt)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {device.scanResult || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              disabled={decideMutation.isPending}
                              onClick={() =>
                                decideMutation.mutate({ deviceId: device.id, data: { status: "approved" } })
                              }
                            >
                              <Check className="size-4" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={decideMutation.isPending}
                              onClick={() =>
                                decideMutation.mutate({ deviceId: device.id, data: { status: "denied" } })
                              }
                            >
                              <X className="size-4" />
                              Deny
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No devices waiting for approval. When the agent detects a USB drive it will appear
              here for review.
            </p>
          )}

          {decided.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Recent decisions</p>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Computer</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Decided</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {decided.map((device) => (
                      <TableRow key={device.id}>
                        <TableCell className="font-medium">{device.computerName}</TableCell>
                        <TableCell>{device.label ?? "Removable device"}</TableCell>
                        <TableCell>
                          <Badge variant={device.status === "approved" ? "default" : "destructive"}>
                            {device.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {formatDateTime(device.decidedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default UsbPolicies;
