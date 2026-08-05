import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getLabSettingsQueryKey,
  useGetLabSettings,
  useUpdateLabSettings,
} from "@workspace/api-client-react";
import { Copy, Download, ExternalLink, KeyRound, Play, Save, Terminal, Timer, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [signinMethod, setSigninMethod] = useState<"password" | "shared_account" | "">("");
  const [sharedUser, setSharedUser] = useState("");
  const [sharedPass, setSharedPass] = useState("");
  const [adminSecret, setAdminSecret] = useState("");
  const [formInitialized, setFormInitialized] = useState(false);

  useEffect(() => {
    if (settings && !formInitialized) {
      setSigninMethod(settings.signinMethod ?? "password");
      setSharedUser(settings.sharedAccountUser ?? "");
      setSharedPass(settings.sharedAccountPassword ?? "");
      setAdminSecret(settings.adminGateSecret ?? "");
      setFormInitialized(true);
    }
  }, [settings, formInitialized]);

  const settingsMutation = useUpdateLabSettings({
    mutation: {
      onSuccess: (result) => {
        queryClient.setQueryData(getLabSettingsQueryKey(), result);
        toast.success("Settings saved.");
      },
      onError: (error) => toast.error(error.message),
    },
  });

  const signinPayload = () => {
    const method = signinMethod || settings?.signinMethod || "password";
    const isShared = method === "shared_account";
    return {
      idleLogoutMinutes: settings?.idleLogoutMinutes ?? null,
      signinMethod: method,
      sharedAccountUser: isShared ? (sharedUser || settings?.sharedAccountUser || null) : null,
      sharedAccountPassword: isShared ? (sharedPass || settings?.sharedAccountPassword || null) : null,
      adminGateSecret: adminSecret || settings?.adminGateSecret || null,
    };
  };

  const saveIdleSetting = () => {
    const parsed = Number(idleMinutes);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Enter a whole number of minutes.");
      return;
    }
    settingsMutation.mutate({
      data: { ...signinPayload(), idleLogoutMinutes: parsed === 0 ? null : Math.floor(parsed) },
    });
  };

  const saveSigninSetting = () => {
    const method = signinMethod || "password";
    if (method === "shared_account" && (!sharedUser.trim() || !sharedPass)) {
      toast.error("Enter the shared account username and password.");
      return;
    }
    settingsMutation.mutate({ data: signinPayload() });
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
            <li>Removes the Windows auto-login setting by default, or auto-logs into a local
            account when the lab selects the "login form instead of password" method</li>
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
            <KeyRound className="size-4" />
            Sign-in method
          </CardTitle>
          <CardDescription>
            Choose how students get into each lab PC. Applied on the agent's next heartbeat; a
            reinstall of the agent is only needed when upgrading the script itself.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-1.5">
            <label htmlFor="signin-method" className="text-sm font-medium">
              Method
            </label>
            <Select
              value={signinMethod || "password"}
              onValueChange={(value) => setSigninMethod(value as "password" | "shared_account")}
            >
              <SelectTrigger id="signin-method" className="w-full max-w-sm">
                <SelectValue placeholder="Choose a method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="password">Windows password, then login form</SelectItem>
                <SelectItem value="shared_account">Login form instead of password (auto-login)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {signinMethod === "shared_account" ? (
            <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="shared-user" className="text-sm font-medium">
                  Auto-login account username
                </label>
                <div className="relative">
                  <UserRound className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="shared-user"
                    type="text"
                    autoComplete="off"
                    placeholder="e.g. student"
                    value={sharedUser}
                    onChange={(event) => setSharedUser(event.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="shared-pass" className="text-sm font-medium">
                  Auto-login account password
                </label>
                <div className="relative">
                  <KeyRound className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="shared-pass"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={sharedPass}
                    onChange={(event) => setSharedPass(event.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                The agent creates this local Windows account on each PC if it does not exist, then
                enables auto-login so every boot lands on this account. The login form is the only
                barrier after that — no password prompt is shown.
              </p>
            </div>
          ) : null}

          <div className="grid gap-3 rounded-md border p-3">
            <div className="grid gap-1.5">
              <label htmlFor="admin-secret" className="text-sm font-medium">
                Administrator passphrase (login form)
              </label>
              <div className="relative">
                <KeyRound className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="admin-secret"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Set a secret administrators enter on the PC"
                  value={adminSecret}
                  onChange={(event) => setAdminSecret(event.target.value)}
                  className="pl-8"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                The login form has a Student tab and an Administrator tab. Anyone entering this
                passphrase on the Administrator tab signs in as an administrator (recorded in the
                Check-ins log and the dashboard opens). Leave empty to disable administrator
                sign-in on the PCs.
              </p>
            </div>
          </div>

          <Button onClick={saveSigninSetting} disabled={settingsMutation.isPending}>
            {settingsMutation.isPending ? <Spinner className="size-4" /> : <Save className="size-4" />}
            Save sign-in method
          </Button>
          <p className="text-xs text-muted-foreground">
            {signinMethod === "shared_account"
              ? `Auto-login account "${sharedUser || settings?.sharedAccountUser || "…"}": PCs boot to the login form instead of the Windows password page.`
              : "Each student signs into their own Windows account, then completes the login form."}
            {adminSecret || settings?.adminGateSecret
              ? " Administrator sign-in via the login form is enabled."
              : " No administrator passphrase set — the Administrator tab is disabled."}
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
            • "Remote view" captures an on-demand screenshot of the interactive session and shows it in
            the dashboard; refresh to update it.
          </p>
          <p>
            • "Wake on LAN" relays a magic packet through another online PC on the same network. Each
            agent reports its physical MAC address, and Wake-on-LAN must be enabled in the PC's BIOS.
          </p>
          <p>
            • "Lock" locks the workstation and marks it so the next sign-in shows the required login
            screen. "Unlock" clears the requirement and dismisses the form. The login screen also
            appears whenever a user signs in to a PC, with a Student tab and an Administrator tab.
          </p>
          <p>
            • With "Login form instead of password", every PC boots into one local Windows account
            (created automatically) and the login form is the only barrier — no Windows password page
            is shown. It turns auto-login on; switching back to "password" removes auto-login again.
            This shares a single Windows profile across all students, so files are not isolated per
            student.
          </p>
          <p>
            • USB modes can be set per computer (allow / block / review). In "review" (quarantine),
            newly inserted flash drives and phones are disabled at the device level — they cannot be
            used or charged — and scanned with Defender. They stay blocked until you approve them on
            the USB Policy page, which re-enables them automatically.
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
