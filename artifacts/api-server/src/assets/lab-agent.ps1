# ============================================================================
# Lab Command Center - client agent (Windows / PowerShell 5.1+)
#
# Zero-dependency agent that runs on each lab PC. It:
#   * registers with the server and keeps a token in config.json
#   * reports heartbeats (status, logged-in user, OS, antivirus, firewall)
#   * tracks student login/logout for attendance
#   * detects USB storage insertion, scans it with Defender, and reports it
#   * ejects removable drives that are not approved by the administrator
#   * inventories keyboard/mouse/monitor peripherals, warns on-screen (full
#     screen overlay) when a baseline device is disconnected, and reports
#     connect/disconnect to the server with the current user
#   * logs the user out automatically after a configurable idle time
#   * executes remote actions (lock, restart, message, file push/delete, AV
#     scan/update/toggle, firewall enable/disable, Remote Desktop enable)
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File lab-agent.ps1 -ServerUrl https://YOUR-APP.onrender.com
#   powershell -NoProfile -ExecutionPolicy Bypass -File lab-agent.ps1 -ServerUrl https://YOUR-APP.onrender.com -Install
#
#   -Install copies the script into ProgramData and registers a scheduled
#   task that starts it at every user logon.
# ============================================================================

param(
  [string]$ServerUrl = $env:LCC_SERVER_URL,
  [switch]$Install,
  [int]$IntervalSeconds = 20
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$script:AgentVersion = '1.1.0'
$ConfigDir = Join-Path $env:ProgramData 'LabCommandCenter'
$ConfigPath = Join-Path $ConfigDir 'config.json'
$AgentPath = Join-Path $ConfigDir 'lab-agent.ps1'
$LockPath = Join-Path $ConfigDir 'agent.lock'
$TaskName = 'LabCommandCenter Agent'

function Write-Log {
  param([string]$Message)
  $ts = Get-Date -Format 'HH:mm:ss'
  Write-Host ("[{0}] {1}" -f $ts, $Message)
}

function Save-Config {
  param($Config)
  New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
  $Config | ConvertTo-Json -Compress | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
}

function Get-Config {
  if (-not (Test-Path -LiteralPath $ConfigPath)) { return $null }
  try {
    $raw = Get-Content -LiteralPath $ConfigPath -Raw
    if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
    return ($raw | ConvertFrom-Json)
  } catch { return $null }
}

function Invoke-ApiJson {
  param(
    [string]$Method,
    [string]$Path,
    $Body = $null
  )
  $url = "$ServerUrl$Path"
  $params = @{ Method = $Method; Uri = $url; TimeoutSec = 30 }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = ($Body | ConvertTo-Json -Compress -Depth 6)
  }
  return Invoke-RestMethod @params
}

function Register-Agent {
  if ([string]::IsNullOrWhiteSpace($ServerUrl)) {
    throw 'Server URL is required. Pass -ServerUrl https://YOUR-APP.onrender.com'
  }
  $hostname = $env:COMPUTERNAME
  $osName = 'Windows'
  try { $osName = (Get-CimInstance Win32_OperatingSystem -ErrorAction Stop).Caption } catch {}
  $reg = Invoke-ApiJson -Method 'POST' -Path '/api/agent/register' -Body @{
    name = $hostname
    os = $osName
    agentVersion = $script:AgentVersion
  }
  $cfg = @{
    serverUrl = $ServerUrl
    token = $reg.token
    computerId = $reg.computerId
    name = $reg.name
    os = $osName
  }
  Save-Config $cfg
  return $cfg
}

function Get-CurrentUser {
  try {
    $user = (whoami 2>$null)
    if ($user) { return $user.Trim() }
  } catch {}
  return ''
}

function Get-AvStatus {
  $result = @{ enabled = $null; signature = $null; lastScan = $null }
  try {
    $mp = Get-MpComputerStatus -ErrorAction Stop
    $result.enabled = ($mp.AntivirusEnabled -eq $true)
    if ($mp.AntivirusSignatureVersion) { $result.signature = $mp.AntivirusSignatureVersion }
    if ($mp.AntivirusScanEndTime) { $result.lastScan = $mp.AntivirusScanEndTime.ToString('o') }
  } catch {}
  return $result
}

function Get-FirewallStatus {
  $result = @{ enabled = $null; profiles = '' }
  try {
    $fw = @(Get-NetFirewallProfile -ErrorAction Stop)
    if ($fw.Count -gt 0) {
      $parts = @()
      $allOn = $true
      foreach ($p in $fw) {
        $on = ($p.Enabled -eq $true)
        if (-not $on) { $allOn = $false }
        $state = if ($on) { 'On' } else { 'Off' }
        $parts += ('{0}={1}' -f $p.Name, $state)
      }
      $result.enabled = $allOn
      $result.profiles = ($parts -join ', ')
    }
  } catch {}
  return $result
}

function Get-Peripherals {
  $result = @()
  $classes = @('Keyboard', 'Mouse', 'Monitor')
  $kindMap = @{ 'Keyboard' = 'keyboard'; 'Mouse' = 'mouse'; 'Monitor' = 'monitor' }
  try {
    foreach ($cls in $classes) {
      $devices = @(Get-PnpDevice -Class $cls -ErrorAction SilentlyContinue)
      foreach ($dev in $devices) {
        if (-not $dev.InstanceId) { continue }
        $present = ($dev.Status -eq 'OK') -and ($dev.Present -eq $true)
        $name = if ($dev.FriendlyName) { $dev.FriendlyName } else { $dev.InstanceId }
        $result += [PSCustomObject]@{
          kind = $kindMap[$cls]
          name = $name
          instanceId = $dev.InstanceId
          present = $present
        }
      }
    }
  } catch {}
  return $result
}

function Get-IdleSeconds {
  try {
    if (-not $script:idleHelperLoaded) {
      Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class LccIdleHelper {
  [DllImport("user32.dll")]
  public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  [StructLayout(LayoutKind.Sequential)]
  public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
}
"@ -ErrorAction Stop
      $script:idleHelperLoaded = $true
    }
    $lii = New-Object LccIdleHelper+LASTINPUTINFO
    $lii.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($lii)
    [LccIdleHelper]::GetLastInputInfo([ref]$lii) | Out-Null
    $idle = ([Environment]::TickCount - [int]$lii.dwTime) / 1000
    if ($idle -lt 0) { $idle = 0 }
    return [int]$idle
  } catch { return 0 }
}

$script:WarningScriptPath = Join-Path $ConfigDir 'peripheral-warning.ps1'
$script:warningPid = $null
$script:lastWarningKey = $null
$script:idleHelperLoaded = $false

function Ensure-WarningScript {
  $content = @'
param([string]$Devices = '')
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$devices = @($Devices -split ';' | Where-Object { $_ -and $_.Trim() })
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Lab Command Center'
$form.WindowState = [System.Windows.Forms.FormWindowState]::Maximized
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.TopMost = $true
$form.BackColor = [System.Drawing.Color]::Black
$title = New-Object System.Windows.Forms.Label
$title.Text = 'DEVICE DISCONNECTED'
$title.Font = New-Object System.Drawing.Font('Segoe UI', 36, [System.Drawing.FontStyle]::Bold)
$title.ForeColor = [System.Drawing.Color]::FromArgb(224, 32, 32)
$title.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$title.Dock = [System.Windows.Forms.DockStyle]::Top
$title.Height = 160
$msg = New-Object System.Windows.Forms.Label
$msg.Text = "One or more peripheral devices are disconnected.`nPlease return the following device(s) so the computer stays under supervision:"
$msg.Font = New-Object System.Drawing.Font('Segoe UI', 16)
$msg.ForeColor = [System.Drawing.Color]::White
$msg.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$msg.Dock = [System.Windows.Forms.DockStyle]::Top
$msg.Height = 140
$list = New-Object System.Windows.Forms.Label
$list.Text = if ($devices.Count -gt 0) { ($devices -join "`n`n") } else { 'Unknown device' }
$list.Font = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
$list.ForeColor = [System.Drawing.Color]::Yellow
$list.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$list.Dock = [System.Windows.Forms.DockStyle]::Fill
$form.Controls.Add($list)
$form.Controls.Add($msg)
$form.Controls.Add($title)
[System.Windows.Forms.Application]::Run($form)
'@
  Set-Content -LiteralPath $script:WarningScriptPath -Value $content -Encoding UTF8
}

function Show-PeripheralWarning {
  param([string[]]$Devices)
  Ensure-WarningScript
  $argLine = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -Devices "{1}"' -f $script:WarningScriptPath, ($Devices -join ';')
  $proc = Start-Process -FilePath 'powershell.exe' -ArgumentList $argLine -WindowStyle Hidden -PassThru
  $script:warningPid = $proc.Id
}

function Stop-PeripheralWarning {
  if ($script:warningPid) {
    Stop-Process -Id $script:warningPid -Force -ErrorAction SilentlyContinue
    $script:warningPid = $null
  }
  $script:lastWarningKey = $null
}

function Save-Baseline {
  param([string[]]$InstanceIds)
  $cfg = Get-Config
  if (-not $cfg) { return }
  $cfg | Add-Member -NotePropertyName baselinePeripherals -NotePropertyValue @($InstanceIds) -Force
  Save-Config $cfg
}

function Get-RemovableDrives {
  $result = @()
  try {
    $disks = Get-CimInstance Win32_LogicalDisk -Filter 'DriveType = 2' -ErrorAction SilentlyContinue
    foreach ($disk in $disks) {
      if (-not $disk.DeviceID) { continue }
      $serial = ''
      try {
        $volume = Get-CimInstance Win32_Volume -Filter ("DeviceID='{0}'" -f $disk.DeviceID) -ErrorAction SilentlyContinue
        if ($volume -and $volume.SerialNumber) { $serial = $volume.SerialNumber }
      } catch {}
      $result += [PSCustomObject]@{
        Letter = $disk.DeviceID.TrimEnd(':')
        Label = $disk.VolumeName
        Serial = $serial
      }
    }
  } catch {}
  return $result
}

function Get-UsbKey {
  param($Drive)
  if ($Drive.Serial) { return ('serial={0}' -f $Drive.Serial) }
  return ('letter={0}' -f $Drive.Letter)
}

function Show-Message {
  param([string]$Text)
  try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
    Add-Type -AssemblyName System.Drawing -ErrorAction Stop
    $notify = New-Object System.Windows.Forms.NotifyIcon
    $notify.Icon = [System.Drawing.SystemIcons]::Information
    $notify.Visible = $true
    $notify.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
    $notify.BalloonTipTitle = 'Lab Command Center'
    $notify.BalloonTipText = $Text
    $notify.ShowBalloonTip(10000)
    Start-Sleep -Seconds 1
    $notify.Dispose()
  } catch {
    try { & msg.exe '*' $Text 2>$null | Out-Null } catch {}
  }
}

function Enable-RemoteDesktop {
  $notes = @()
  try {
    New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server' -Name 'fDenyTSConnections' -Value 0 -PropertyType DWord -Force -ErrorAction Stop | Out-Null
    $notes += 'Remote Desktop enabled.'
  } catch {
    $notes += 'RDP enable needs admin rights; use Quick Assist instead.'
  }
  $ip = ''
  try {
    $ipObj = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
      $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.*'
    } | Select-Object -First 1
    if ($ipObj) { $ip = $ipObj.IPAddress }
  } catch {}
  return @{ success = $true; detail = ('Host {0} IP {1}. {2}' -f $env:COMPUTERNAME, $ip, ($notes -join ' ')) }
}

function Receive-PushedFile {
  param($Payload)
  if (-not $Payload.fileId) { return @{ success = $false; detail = 'Missing fileId' } }
  $fileName = 'downloaded'
  if ($Payload.fileName) { $fileName = (Split-Path $Payload.fileName -Leaf) }
  $dest = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  $destPath = Join-Path $dest $fileName
  $url = '{0}/api/agent/files/download/{1}?token={2}' -f $ServerUrl, $Payload.fileId, $config.token
  Invoke-WebRequest -Uri $url -OutFile $destPath -UseBasicParsing -TimeoutSec 120
  return @{ success = $true; detail = ('Saved to {0}' -f $destPath) }
}

function Remove-TargetFile {
  param($Payload)
  if (-not $Payload.path) { return @{ success = $false; detail = 'No path provided' } }
  $target = $Payload.path
  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Force -Recurse -ErrorAction Stop
    return @{ success = $true; detail = ('Deleted {0}' -f $target) }
  }
  return @{ success = $false; detail = ('Path not found: {0}' -f $target) }
}

function Invoke-AvScan {
  param($Payload)
  $mode = 'quick'
  if ($Payload.type -eq 'full') { $mode = 'full' }
  $scanPath = $Payload.path
  try {
    $status = Get-MpComputerStatus -ErrorAction Stop
    if ($status.AntivirusEnabled -ne $true) {
      return @{ success = $false; detail = 'Windows Defender is not enabled' }
    }
    if ($scanPath) {
      Start-MpScan -ScanPath $scanPath -ScanType QuickScan -ErrorAction Stop
      return @{ success = $true; detail = ('Defender scan completed on {0}' -f $scanPath) }
    }
    if ($mode -eq 'full') {
      Start-MpScan -ScanType FullScan -ErrorAction Stop
      return @{ success = $true; detail = 'Defender full scan completed' }
    }
    Start-MpScan -ScanType QuickScan -ErrorAction Stop
    return @{ success = $true; detail = 'Defender quick scan completed' }
  } catch {
    return @{ success = $false; detail = $_.Exception.Message }
  }
}

function Eject-RemovableDrives {
  try {
    $shell = New-Object -ComObject Shell.Application
    $drives = Get-RemovableDrives
    foreach ($drive in $drives) {
      try {
        $item = $shell.Namespace(17).ParseName(('{0}:' -f $drive.Letter))
        if ($item) { $item.InvokeVerb('Eject') }
      } catch {}
    }
  } catch {}
}

function Execute-Action {
  param($Action)
  $actionName = $Action.action
  $payload = @{}
  if ($Action.payload) {
    try { $payload = ($Action.payload | ConvertFrom-Json) } catch {}
  }

  $result = $null
  try {
    switch ($actionName) {
      'lock' {
        & rundll32.exe user32.dll,LockWorkStation 2>$null
        $result = @{ success = $true }
        break
      }
      'unlock' {
        $result = @{ success = $true; detail = 'Unlock requires credentials; acknowledged.' }
        break
      }
      'restart' {
        & shutdown.exe /r /t 30 /c "Lab Command Center: restart requested" /f 2>$null
        $result = @{ success = $true; detail = 'Restart scheduled in 30 seconds.' }
        break
      }
      'wake' {
        $result = @{ success = $true; detail = 'Wake-on-LAN is sent from the server; acknowledged.' }
        break
      }
      'send_message' {
        $msg = $Action.message
        if (-not $msg -and $payload.message) { $msg = $payload.message }
        if ($msg) { Show-Message $msg }
        $result = @{ success = $true; detail = 'Message displayed.' }
        break
      }
      'remote_view' {
        $result = @{ success = $true; detail = 'Remote view is not supported by the agent yet.' }
        break
      }
      'remote_control' {
        $result = Enable-RemoteDesktop
        break
      }
      'block_usb' {
        Eject-RemovableDrives
        $result = @{ success = $true; detail = 'Removable drives ejected; policy recorded.' }
        break
      }
      'allow_usb' {
        $result = @{ success = $true; detail = 'USB allowed; policy recorded.' }
        break
      }
      'push_file' {
        $result = Receive-PushedFile $payload
        break
      }
      'delete_file' {
        $result = Remove-TargetFile $payload
        break
      }
      'av_scan' {
        $result = Invoke-AvScan $payload
        break
      }
      'av_update' {
        try {
          Update-MpSignature -ErrorAction Stop | Out-Null
          $result = @{ success = $true; detail = 'Antivirus definitions updated.' }
        } catch {
          $result = @{ success = $false; detail = $_.Exception.Message }
        }
        break
      }
      'av_toggle' {
        $enabled = $true
        if ($payload.enabled -is [bool]) { $enabled = $payload.enabled }
        try {
          Set-MpPreference -DisableRealtimeMonitoring (-not $enabled) -ErrorAction Stop
          $detail = if ($enabled) { 'Real-time protection enabled.' } else { 'Real-time protection disabled.' }
          $result = @{ success = $true; detail = $detail }
        } catch {
          $result = @{ success = $false; detail = $_.Exception.Message }
        }
        break
      }
      'fw_enable' {
        try {
          Set-NetFirewallProfile -All -Enabled True -ErrorAction Stop
          $result = @{ success = $true; detail = 'Windows Firewall enabled on all profiles.' }
        } catch {
          $result = @{ success = $false; detail = $_.Exception.Message }
        }
        break
      }
      'fw_disable' {
        try {
          Set-NetFirewallProfile -All -Enabled False -ErrorAction Stop
          $result = @{ success = $true; detail = 'Windows Firewall disabled on all profiles.' }
        } catch {
          $result = @{ success = $false; detail = $_.Exception.Message }
        }
        break
      }
      default {
        $result = @{ success = $true; detail = ('Unknown action: {0}' -f $actionName) }
        break
      }
    }
  } catch {
    $result = @{ success = $false; detail = $_.Exception.Message }
  }

  if (-not $result) { $result = @{ success = $false; detail = 'No result' } }

  $body = @{ token = $config.token; success = $result.success }
  if ($result.detail) { $body.detail = $result.detail }
  try {
    Invoke-ApiJson -Method 'POST' -Path ('/api/agent/actions/{0}/complete' -f $Action.id) -Body $body | Out-Null
  } catch {}
  if ($result.success) {
    Write-Log ('Action "{0}" completed{1}' -f $actionName, $(if ($result.detail) { ' - ' + $result.detail } else { '' }))
  } else {
    Write-Log ('Action "{0}" FAILED: {1}' -f $actionName, $result.detail)
  }
}

# ---------------------------------------------------------------------------
# Install mode: copy the script and register a scheduled task at user logon
# ---------------------------------------------------------------------------
if ($Install) {
  if ([string]::IsNullOrWhiteSpace($ServerUrl)) {
    throw 'Server URL is required with -Install: -Install -ServerUrl https://YOUR-APP.onrender.com'
  }
  New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
  Copy-Item -LiteralPath $MyInvocation.MyCommand.Path -Destination $AgentPath -Force
  $taskCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $AgentPath -ServerUrl $ServerUrl"
  & schtasks.exe /Create /TN $TaskName /TR $taskCmd /SC ONLOGON /RL LIMITED /F | Out-Null
  & schtasks.exe /Run /TN $TaskName | Out-Null
  Write-Log 'Installed. The agent will start at every user logon and now.'
  exit 0
}

# ---------------------------------------------------------------------------
# Single-instance guard
# ---------------------------------------------------------------------------
$existingPid = Get-Content -LiteralPath $LockPath -ErrorAction SilentlyContinue
if ($existingPid) {
  $proc = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
  if ($proc) {
    Write-Log ('Another instance is running (PID {0}). Exiting.' -f $existingPid)
    exit 0
  }
}
New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
Set-Content -LiteralPath $LockPath -Value $PID -Encoding UTF8 -ErrorAction SilentlyContinue

# ---------------------------------------------------------------------------
# Load or create configuration
# ---------------------------------------------------------------------------
$config = Get-Config
if (-not $config) {
  $config = Register-Agent
  Write-Log ('Registered as {0} (computer id {1}).' -f $config.name, $config.computerId)
}
$ServerUrl = $config.serverUrl
$script:seenUsb = @()

Write-Log ('Agent v{0} running for {1} -> {2}' -f $script:AgentVersion, $config.name, $ServerUrl)

try {
  while ($true) {
    try {
      $user = Get-CurrentUser
      $av = Get-AvStatus
      $fw = Get-FirewallStatus

      $hbBody = @{
        token = $config.token
        userName = $user
        os = $config.os
        agentVersion = $script:AgentVersion
      }
      if ($null -ne $av.enabled) { $hbBody.avEnabled = $av.enabled }
      if ($av.signature) { $hbBody.avSignature = $av.signature }
      if ($av.lastScan) { $hbBody.avLastScanAt = $av.lastScan }
      if ($null -ne $fw.enabled) { $hbBody.firewallEnabled = $fw.enabled }
      if ($fw.profiles) { $hbBody.firewallProfiles = $fw.profiles }

      $hb = Invoke-ApiJson -Method 'POST' -Path '/api/agent/heartbeat' -Body $hbBody

      if ($hb.pendingActions) {
        foreach ($action in $hb.pendingActions) {
          Execute-Action $action
        }
      }

      # ---- USB handling ---------------------------------------------------
      $drives = Get-RemovableDrives
      $currentKeys = @()
      foreach ($drive in $drives) {
        $key = Get-UsbKey $drive
        $currentKeys += $key
        if ($script:seenUsb -notcontains $key) {
          $script:seenUsb += $key
          $detail = 'Drive {0}: {1} serial={2}' -f $drive.Letter, $drive.Label, $drive.Serial
          $scanNote = ''
          try {
            $mp = Get-MpComputerStatus -ErrorAction SilentlyContinue
            if ($mp -and ($mp.AntivirusEnabled -eq $true)) {
              Start-MpScan -ScanPath ('{0}:\' -f $drive.Letter) -ScanType QuickScan -ErrorAction SilentlyContinue | Out-Null
              $scanNote = ' Defender scan completed.'
            }
          } catch {}
          $eventBody = @{ token = $config.token; type = 'usb_connected'; detail = $detail; message = $scanNote }
          try { Invoke-ApiJson -Method 'POST' -Path '/api/agent/events' -Body $eventBody | Out-Null } catch {}
          Write-Log ('USB device detected: {0}' -f $detail)
        }
      }
      $script:seenUsb = @($script:seenUsb | Where-Object { $currentKeys -contains $_ })

      # ---- enforce USB policy ---------------------------------------------
      $restrictive = ($hb.computer.usbState -eq 'blocked') -or ($hb.computer.usbState -eq 'review')
      if ($restrictive -and $hb.allowedUsb) {
        foreach ($drive in $drives) {
          if ($hb.allowedUsb -notcontains $drive.Letter) {
            try {
              $shell = New-Object -ComObject Shell.Application
              $item = $shell.Namespace(17).ParseName(('{0}:' -f $drive.Letter))
              if ($item) { $item.InvokeVerb('Eject') }
              Write-Log ('Ejected unapproved USB drive {0}:.' -f $drive.Letter)
            } catch {}
          }
        }
      }

      # ---- idle auto-logout -------------------------------------------------
      $isSystemUser = ($user -match '(?i)^nt authority\\') -or ($user -match '\$$')
      if ($hb.idleLogoutMinutes -and ([int]$hb.idleLogoutMinutes) -gt 0 -and $user -and -not $isSystemUser) {
        $idleSeconds = Get-IdleSeconds
        if ($idleSeconds -ge ([int]$hb.idleLogoutMinutes) * 60) {
          Write-Log ('Idle {0}s exceeds limit of {1} min. Logging off {2}.' -f $idleSeconds, $hb.idleLogoutMinutes, $user)
          Show-Message 'Lab Command Center: this computer was idle too long and will now log off.'
          & shutdown.exe /l /f 2>$null
        }
      }

      # ---- peripherals ------------------------------------------------------
      $peripherals = @(Get-Peripherals)
      if ($peripherals.Count -gt 0) {
        $pBody = @{ token = $config.token; user = $user }
        $pBody.devices = @()
        foreach ($dev in $peripherals) {
          $pBody.devices += @{ kind = $dev.kind; name = $dev.name; instanceId = $dev.instanceId; present = $dev.present }
        }
        try { Invoke-ApiJson -Method 'POST' -Path '/api/agent/peripherals' -Body $pBody | Out-Null } catch {}
      }

      $baseline = @($config.baselinePeripherals)
      if ($baseline.Count -eq 0) {
        $present = @($peripherals | Where-Object { $_.present } | ForEach-Object { $_.instanceId })
        if ($present.Count -gt 0) {
          Save-Baseline $present
          $baseline = $present
          Write-Log ('Peripheral baseline captured: {0} device(s).' -f $present.Count)
        }
      }

      $missing = @()
      if ($baseline.Count -gt 0) {
        foreach ($instanceId in $baseline) {
          $dev = $peripherals | Where-Object { $_.instanceId -eq $instanceId }
          if (-not $dev -or -not $dev.present) {
            $name = if ($dev) { $dev.name } else { $instanceId }
            $missing += $name
          }
        }
      }

      if ($missing.Count -gt 0) {
        $missingKey = ($missing | Sort-Object) -join '|'
        $running = $script:warningPid -and (Get-Process -Id $script:warningPid -ErrorAction SilentlyContinue)
        if (-not $running -or $script:lastWarningKey -ne $missingKey) {
          Stop-PeripheralWarning
          Show-PeripheralWarning -Devices $missing
          $script:lastWarningKey = $missingKey
          Write-Log ('Peripheral warning shown for: {0}' -f ($missing -join ', '))
        }
      } else {
        Stop-PeripheralWarning
      }
    } catch {
      $statusCode = 0
      if ($_.Exception.Response) { $statusCode = [int]$_.Exception.Response.StatusCode }
      if ($statusCode -eq 401) {
        Write-Log 'Agent token rejected. Re-registering...'
        Remove-Item -LiteralPath $ConfigPath -Force -ErrorAction SilentlyContinue
        $config = Register-Agent
        $ServerUrl = $config.serverUrl
      } else {
        Write-Log ('Heartbeat failed: {0}' -f $_.Exception.Message)
      }
    }

    Start-Sleep -Seconds $IntervalSeconds
  }
} finally {
  Stop-PeripheralWarning
  Remove-Item -LiteralPath $LockPath -Force -ErrorAction SilentlyContinue
}
