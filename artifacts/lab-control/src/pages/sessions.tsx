import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetComputersQueryKey,
  getGetLabSummaryQueryKey,
  getGetStudentSessionsQueryKey,
  useCreateStudentSession,
  useGetComputers,
  useGetStudentSessions,
} from "@workspace/api-client-react";
import { Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { SessionStatusBadge } from "@/components/badges";
import { formatDateTime } from "@/lib/format";

function Sessions() {
  const queryClient = useQueryClient();
  const { data: sessions, isLoading } = useGetStudentSessions({
    query: { queryKey: getGetStudentSessionsQueryKey(), refetchInterval: 15_000 },
  });
  const { data: computers } = useGetComputers();

  const [open, setOpen] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [computerId, setComputerId] = useState<string>("");

  const createMutation = useCreateStudentSession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetStudentSessionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetComputersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetLabSummaryQueryKey() });
        setOpen(false);
        setStudentName("");
        setStudentId("");
        setComputerId("");
        toast.success("Session started");
      },
      onError: (error) => toast.error(error.message),
    },
  });

  const availableComputers = useMemo(
    () => (computers ?? []).filter((computer) => computer.status !== "offline"),
    [computers],
  );

  const create = () => {
    if (!computerId) return;
    createMutation.mutate({
      data: {
        studentName: studentName.trim(),
        studentId: studentId.trim(),
        computerId: Number(computerId),
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Student Sessions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track who is signed in across the lab.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Start session
        </Button>
      </div>

      <div className="rounded-lg border">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : sessions && sessions.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Student ID</TableHead>
                <TableHead>Computer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Ended</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="font-medium">{session.studentName}</TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">{session.studentId}</span>
                  </TableCell>
                  <TableCell>{session.computerName}</TableCell>
                  <TableCell>
                    <SessionStatusBadge status={session.status} />
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground tabular-nums">
                      {formatDateTime(session.startedAt)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground tabular-nums">
                      {formatDateTime(session.endedAt)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia>
                <UserPlus className="size-5" />
              </EmptyMedia>
              <EmptyTitle>No sessions yet</EmptyTitle>
              <EmptyDescription>
                Start a session to track a student's computer usage in the lab.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a session</DialogTitle>
            <DialogDescription>Sign a student in on one of the lab computers.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="student-name">Student name</Label>
              <Input
                id="student-name"
                placeholder="e.g. Jane Doe"
                value={studentName}
                onChange={(event) => setStudentName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="student-id">Student ID</Label>
              <Input
                id="student-id"
                placeholder="e.g. 20260042"
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Computer</Label>
              <Select value={computerId} onValueChange={setComputerId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a computer" />
                </SelectTrigger>
                <SelectContent>
                  {availableComputers.map((computer) => (
                    <SelectItem key={computer.id} value={String(computer.id)}>
                      {computer.name} · {computer.room}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableComputers.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No online computers available.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={create}
              disabled={
                studentName.trim().length === 0 || studentId.trim().length === 0 || !computerId || createMutation.isPending
              }
            >
              {createMutation.isPending ? <Spinner className="size-4" /> : <UserPlus className="size-4" />}
              Start session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Sessions;
