import { useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  getBrowseComputerFilesQueryKey,
  getGetComputersQueryKey,
  getGetLabSummaryQueryKey,
  type BrowseFilesResult,
  type Computer,
  type FileEntry,
  useBroadcastDeleteFiles,
  useBroadcastPushFile,
  useBrowseComputerFiles,
  useGetComputers,
} from "@workspace/api-client-react";
import { ArrowUp, FileText, FileUp, Folder, FolderOpen, FolderUp, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/badges";
import { PrintButton } from "@/components/print-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function joinPath(parent: string, name: string): string {
  if (parent.endsWith("\\") || parent.endsWith("/")) return parent + name;
  return `${parent}\\${name}`;
}

function parentPath(current: string): string | null {
  const trimmed = current.replace(/[\\/]+$/, "");
  if (!trimmed) return null;
  const index = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  if (index < 0) return null;
  return trimmed.slice(0, index);
}

function ComputerBrowser({
  computer,
  queryClient,
}: {
  computer: Computer;
  queryClient: QueryClient;
}) {
  const [path, setPath] = useState("C:\\");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const browse = useBrowseComputerFiles(computer.id, path, {
    query: {
      queryKey: getBrowseComputerFilesQueryKey(computer.id, path),
      refetchInterval: (query) => (query.state.data?.pending ? 2_000 : false),
    },
  });

  const del = useBroadcastDeleteFiles({
    mutation: {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getBrowseComputerFilesQueryKey(computer.id, path) });
        toast.success(result.queued > 0 ? "Delete queued for the PC." : "No agent to delete on.");
      },
      onError: (error) => toast.error(error.message),
    },
  });

  const push = useBroadcastPushFile({
    mutation: {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getBrowseComputerFilesQueryKey(computer.id, path) });
        if (uploadRef.current) uploadRef.current.value = "";
        setUploadFile(null);
        toast.success(
          result.queued > 0
            ? `"${result.fileName}" queued to ${path}.`
            : "No agent to upload to.",
        );
      },
      onError: (error) => toast.error(error.message),
    },
  });

  const data: BrowseFilesResult | undefined = browse.data;

  const openFolder = (entry: FileEntry) => {
    if (!entry.isDir) return;
    setPath(joinPath(path, entry.name));
  };

  const goUp = () => {
    const up = parentPath(path);
    if (up) setPath(up);
  };

  const confirmDelete = (entry: FileEntry) => {
    const full = joinPath(path, entry.name);
    if (!window.confirm(`Delete "${full}" on ${computer.name}?`)) return;
    del.mutate({ path: full, computerIds: [computer.id], initiatedBy: "Lab administrator" });
  };

  const upload = () => {
    if (!uploadFile) return;
    push.mutate({
      file: uploadFile,
      computerIds: [computer.id],
      initiatedBy: "Lab administrator",
      destination: path,
    });
  };

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={!parentPath(path)} onClick={goUp}>
          <ArrowUp className="size-4" />
          Up
        </Button>
        <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-xs">
          {path}
        </code>
        <input
          ref={uploadRef}
          type="file"
          className="hidden"
          onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={!uploadFile || push.isPending}
          onClick={upload}
        >
          {push.isPending ? <Spinner className="size-4" /> : <Upload className="size-4" />}
          {uploadFile ? `Upload ${uploadFile.name}` : "Upload here"}
        </Button>
      </div>

      {data?.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {data.error}
        </p>
      ) : null}

      {data?.pending ? (
        <p className="flex items-center gap-2 rounded-md border border-dashed bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <Spinner className="size-3" />
          Waiting for {computer.name} to list {data.path}…
        </p>
      ) : null}

      {browse.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : !data || data.entries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia>
              <FolderOpen className="size-5" />
            </EmptyMedia>
            <EmptyTitle>{data?.pending ? "Waiting for the agent…" : "This folder is empty"}</EmptyTitle>
            <EmptyDescription>
              {data?.pending ? `The agent on ${computer.name} will list ${data.path} on its next check-in.` : path}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="max-h-96 overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-24 text-right">Size</TableHead>
                <TableHead className="w-40">Modified</TableHead>
                <TableHead className="w-16 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.entries.map((entry) => (
                <TableRow
                  key={entry.name}
                  className={entry.isDir ? "cursor-pointer" : ""}
                  onClick={() => openFolder(entry)}
                >
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {entry.isDir ? (
                        <Folder className="size-4 shrink-0 text-amber-500" />
                      ) : (
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{entry.name}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {entry.isDir ? "—" : formatBytes(entry.size)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.modifiedAt ? formatDateTime(entry.modifiedAt) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Delete"
                      disabled={del.isPending}
                      onClick={(event) => {
                        event.stopPropagation();
                        confirmDelete(entry);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function Files() {
  const queryClient = useQueryClient();
  const { data: computers, isLoading } = useGetComputers({
    query: { queryKey: getGetComputersQueryKey(), refetchInterval: 10_000 },
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [deletePath, setDeletePath] = useState("");
  const [browseTarget, setBrowseTarget] = useState<Computer | null>(null);
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
          <h1 className="text-2xl font-bold">File Transfer Manager</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Send files to client PCs, delete files and folders on them, or browse a PC's folders.
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
            Check the PCs to target, or leave none selected to apply to all PCs with an agent. Click
            Browse to open a PC's folders.
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
                  PCs that install the agent will appear here as send, delete, and browse targets.
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
                  <TableHead className="text-right">Files</TableHead>
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
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      <Button variant="ghost" size="sm" onClick={() => setBrowseTarget(computer)}>
                        <FolderOpen className="size-4" />
                        Browse
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={browseTarget !== null} onOpenChange={(open) => !open && setBrowseTarget(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Files on {browseTarget?.name}</DialogTitle>
            <DialogDescription>
              Browse the PC's file system. Entries appear after the agent reports them.
            </DialogDescription>
          </DialogHeader>
          {browseTarget ? (
            <ComputerBrowser key={browseTarget.id} computer={browseTarget} queryClient={queryClient} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Files;
