import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getLabSettingsQueryKey,
  useGetLabSettings,
  useUpdateLabSettings,
} from "@workspace/api-client-react";
import { Copy, Download, ExternalLink, Play, Save, Terminal, Timer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const AGENT_DOWNLOAD_URL = "/api/agent/download";

function CodeBlock({ children }: { children: string }) {
  const copy = () => {
    void navigator.clipboard?.writeText(children);
    toast.success("Copied to clipboard");
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
        <Copy className="size-4" />
      </button>
    </div>
  );
}

function Agents() {
  const queryClient = useQueryClient();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const downloadUrl = `${origin}${AGENT_DOWNLOAD_URL}`;
  const installCmd = `powershell -NoProfile -ExecutionPolicy Bypass -File lab-agent.ps1 -ServerUrl ${origin} -Install`;
  const runCmd = `powershell -NoProfile -ExecutionPolicy Bypass -File lab-agent.ps1 -ServerUrl ${origin}`;

  const { data: settings } = useGetLabSettings({
    query: { queryKey: getLabSettingsQueryKey(), refetchInterval: 30_000 },
  });
  const [idleMinutes, setIdleMinutes] = useState("");

  const settingsMutation = useUpdateLabSettings({
    mutation: {
      onSuccess: (result) => {
        queryClient.setQueryData(getLabSettingsQueryKey(), result);
        toast.success(
          result.idleLogoutMinutes
            ? `Users will be logged off after ${result.idleLogoutMinutes} min of inactivity.`
            : "Idle auto-logout disabled.",
        );
      },
      onError: (error) => toast.error(error.message),
    },
  });

  const saveIdleSetting = () => {
    const parsed = Number(idleMinutes);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Enter a whole number of minutes.");
      return;
    }
    settingsMutation.mutate({ data: { idleLogoutMinutes: parsed === 0 ? null : Math.floor(parsed) } });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Client Agent</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A zero-dependency PowerShell agent that runs on each lab PC.
          </p>
        </div>
        <Button asChild>
          <a href={AGENT_DOWNLOAD_URL}>
            <Download className="size-4" />
            Download lab-agent.ps1
          </a>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="size-4" />
            What the agent does
          </CardTitle>
          <CardDescription>
            Reports heartbeats, tracks attendance, watches USB and peripherals, monitors password
            changes, removes auto-login, enforces security settings, and executes remote actions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid list-none gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <li>Live online/offline status and logged-in user</li>
            <li>Student sign-in/out tracking for attendance</li>
            <li>Detects USB drives, scans them with Defender, and reports them</li>
            <li>Ejects drives that are not approved by the administrator</li>
            <li>Inventories keyboards, mice, and monitors; warns on-screen when a device is removed</li>
            <li>Logs users out automatically after a configurable idle time</li>
            <li>Reports antivirus and firewall status; runs AV scans/updates and firewall toggles</li>
            <li>Watches the Security log and reports password changes and resets (4723/4724)</li>
            <li>Removes the Windows auto-login setting so no password is skipped at boot</li>
            <li>Remote actions: lock, restart, message, file push/delete, AV scan</li>
            <li>Enables Remote Desktop and reports IP for remote control</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="size-4" />
            Quick setup on a lab PC
          </CardTitle>
          <CardDescription>
            Requires Windows 10/11 and PowerShell 5.1+ — no other installs. The installed agent
            starts at boot as SYSTEM, so it monitors and controls the PC for every user.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">1. Download the script</p>
            <CodeBlock>{downloadUrl}</CodeBlock>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">2. Test run it</p>
            <CodeBlock>{runCmd}</CodeBlock>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">3. Install it to start at boot as SYSTEM (recommended)</p>
            <CodeBlock>{installCmd}</CodeBlock>
            <p className="text-xs text-muted-foreground">
              Creates a scheduled task that runs at startup under the SYSTEM account, so password
              monitoring, auto-login removal, and idle logout apply to every user on the PC.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="size-4" />
            Idle auto-logout
          </CardTitle>
          <CardDescription>
            Automatically log users out after a period of no keyboard or mouse activity. Applies to
            every PC running the agent. Set to 0 to disable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="grid gap-1.5">
              <label htmlFor="idle-minutes" className="text-sm font-medium">
                Idle minutes
              </label>
              <Input
                id="idle-minutes"
                type="number"
                min={0}
                max={600}
                placeholder={settings?.idleLogoutMinutes ? String(settings.idleLogoutMinutes) : "Disabled"}
                value={idleMinutes}
                onChange={(event) => setIdleMinutes(event.target.value)}
                className="w-44"
              />
            </div>
            <Button onClick={saveIdleSetting} disabled={settingsMutation.isPending}>
              {settingsMutation.isPending ? <Spinner className="size-4" /> : <Save className="size-4" />}
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {settings?.idleLogoutMinutes
              ? `Currently configured: log off after ${settings.idleLogoutMinutes} minutes idle.`
              : "Currently disabled — users are not logged out automatically."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="size-4" />
            Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            • The agent registers itself using the computer name. To rename a machine in the app, edit
            the name directly or reset its agent token in the database.
          </p>
          <p>
            • Remote control uses built-in Remote Desktop or Quick Assist — the agent enables RDP and
            reports the machine's IP when you run the action.
          </p>
          <p>
            • "Unlock", "Wake on LAN", and "Remote view" are acknowledged but not fully supported by
            the agent yet.
          </p>
          <p>
            • USB enforcement ejects unapproved removable drives; for hard blocking on domain-managed
            labs, combine with Group Policy (Removable Storage Access).
          </p>
          <p>
            • Password change/reset monitoring reads the Windows Security log (events 4723/4724); the
            agent enables the "User Account Management" audit policy on first run. Older events before
            the first run are not backfilled.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default Agents;
