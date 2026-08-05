import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetComputersQueryKey,
  getGetLabSummaryQueryKey,
  useBroadcastDeleteFiles,
  useBroadcastPushFile,
  useGetComputers,
} from "@workspace/api-client-react";
import { FileUp, FolderUp, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/badges";
import { PrintButton } from "@/components/print-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function Files() {
  const queryClient = useQueryClient();
  const { data: computers, isLoading } = useGetComputers({
    query: { queryKey: getGetComputersQueryKey(), refetchInterval: 10_000 },
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [deletePath, setDeletePath] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const push = useBroadcastPushFile({
    mutation: {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getGetComputersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetLabSummaryQueryKey() });
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        toast.success(
          result.queued > 0
            ? `"${result.fileName}" queued for ${result.queued} computer(s).`
            : "No computers with agents to send to.",
        );
      },
      onError: (error) => toast.error(error.message),
    },
  });

  const del = useBroadcastDeleteFiles({
    mutation: {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getGetComputersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetLabSummaryQueryKey() });
        setDeletePath("");
        toast.success(
          result.queued > 0
            ? `Delete queued for ${result.queued} computer(s).`
            : "No computers with agents to delete on.",
        );
      },
      onError: (error) => toast.error(error.message),
    },
  });

  const ids = selected.size > 0 ? Array.from(selected) : undefined;
  const allSelected = computers != null && computers.length > 0 && selected.size === computers.length;
  const busy = push.isPending || del.isPending;

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

  const sendFile = () => {
    if (!file) return;
    push.mutate({ file, computerIds: ids, initiatedBy: "Lab administrator" });
  };

  const deleteFiles = () => {
    if (deletePath.trim().length === 0) return;
    del.mutate({ path: deletePath.trim(), computerIds: ids, initiatedBy: "Lab administrator" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Files</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Send files to client PCs or delete files and folders on them.
          </p>
        </div>
        <div className="no-print flex items-center gap-2">
          <PrintButton />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="size-4" />
              Send file
            </CardTitle>
            <CardDescription>
              Upload a file once; each selected PC downloads it into its Downloads folder.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <Button variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
              {file ? (
                <>
                  <FileUp className="size-4" />
                  {file.name} ({formatBytes(file.size)})
                </>
              ) : (
                <>
                  <FileUp className="size-4" />
                  Choose file…
                </>
              )}
            </Button>
            <Button
              className="w-full"
              disabled={!file || busy}
              onClick={sendFile}
            >
              {push.isPending ? <Spinner className="size-4" /> : <FileUp className="size-4" />}
              Send to {selected.size > 0 ? `${selected.size} selected` : "all PCs"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trash2 className="size-4" />
              Delete file or folder
            </CardTitle>
            <CardDescription>
              Remove a file or folder by full path on each selected PC.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="C:\Users\student\Downloads\example.exe"
              value={deletePath}
              onChange={(event) => setDeletePath(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") deleteFiles();
              }}
            />
            <Button
              variant="destructive"
              className="w-full"
              disabled={deletePath.trim().length === 0 || busy}
              onClick={deleteFiles}
            >
              {del.isPending ? <Spinner className="size-4" /> : <Trash2 className="size-4" />}
              Delete on {selected.size > 0 ? `${selected.size} selected` : "all PCs"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderUp className="size-4" />
            Target PCs
          </CardTitle>
          <CardDescription>
            Check the PCs to target, or leave none selected to apply to all PCs with an agent.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
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
                  <FolderUp className="size-5" />
                </EmptyMedia>
                <EmptyTitle>No computers yet</EmptyTitle>
                <EmptyDescription>
                  PCs that install the agent will appear here as send and delete targets.
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
                  <TableHead>Room</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>User</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {computers.map((computer) => (
                  <TableRow
                    key={computer.id}
                    className="cursor-pointer"
                    onClick={() => toggleSelected(computer.id)}
                  >
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${computer.name}`}
                        checked={selected.has(computer.id)}
                        onChange={() => toggleSelected(computer.id)}
                        className="size-4 accent-primary"
                      />
                    </TableCell>
                    <TableCell className="font-medium">{computer.name}</TableCell>
                    <TableCell>{computer.room}</TableCell>
                    <TableCell>
                      <StatusBadge status={computer.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{computer.userName ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Files;
