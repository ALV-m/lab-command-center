import { Copy, Download, ExternalLink, Play, Terminal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

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
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const downloadUrl = `${origin}${AGENT_DOWNLOAD_URL}`;
  const installCmd = `powershell -NoProfile -ExecutionPolicy Bypass -File lab-agent.ps1 -ServerUrl ${origin} -Install`;
  const runCmd = `powershell -NoProfile -ExecutionPolicy Bypass -File lab-agent.ps1 -ServerUrl ${origin}`;

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
            Reports heartbeats, tracks attendance, watches USB storage, and executes remote actions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid list-none gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <li>Live online/offline status and logged-in user</li>
            <li>Student sign-in/out tracking for attendance</li>
            <li>Detects USB drives, scans them with Defender, and reports them</li>
            <li>Ejects drives that are not approved by the administrator</li>
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
            Requires Windows 10/11 and PowerShell 5.1+ — no other installs.
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
            <p className="text-sm font-medium">3. Install it to run at every logon (recommended)</p>
            <CodeBlock>{installCmd}</CodeBlock>
          </div>
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
        </CardContent>
      </Card>
    </div>
  );
}

export default Agents;
