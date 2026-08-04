# ============================================================================
# Lab Command Center - client agent (Windows / PowerShell 5.1+)
#
# Zero-dependency agent that runs on each lab PC. It:
#   * registers with the server and keeps a token in config.json
#   * runs as a SYSTEM boot task so it covers ALL users on the machine
#   * reports heartbeats (status, console user, OS, antivirus, firewall,
#     live scan state)
#   * tracks the interactive (console) user for attendance
#   * detects USB storage insertion, scans it with Defender, and reports it
#   * ejects removable drives that are not approved by the administrator
#   * inventories keyboard/mouse/monitor peripherals, warns on-screen (full
#     screen overlay) when a baseline device is disconnected, and reports
#     connect/disconnect to the server with the current user
#   * monitors the Security log for local account password changes (4723) and
#     password resets (4724) and reports them as alerts/events
#   * disables Windows auto-login at boot so PCs always land on the login page
#   * logs the console user out automatically after a configurable idle time
#   * runs antivirus scans as background jobs and reports scanning status
#   * executes remote actions (lock, restart, message, file push/delete, AV
#     scan/update/toggle, firewall enable/disable, Remote Desktop enable)
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File lab-agent.ps1 -ServerUrl https://YOUR-APP.onrender.com
#   powershell -NoProfile -ExecutionPolicy Bypass -File lab-agent.ps1 -ServerUrl https://YOUR-APP.onrender.com -Install
#
#   -Install copies the script into ProgramData and registers a scheduled
#   task that starts it at boot as the SYSTEM account (before any user logs
#   in), so one install covers every user on the PC. Run it from an elevated
#   PowerShell window.
# ============================================================================

param(
  [string]$ServerUrl = $env:LCC_SERVER_URL,
  [switch]$Install,
  [int]$IntervalSeconds = 20
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$script:AgentVersion = '1.2.0'
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

function Get-IsSystem {
  try {
    $who = (whoami 2>$null)
    if ($who) { return ($who -match '(?i)nt authority\\system') }
  } catch {}
  return $false
}

function Get-CurrentUser {
  # The interactive (console) user, even when the agent runs as SYSTEM.
  try {
    $cs = Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
    if ($cs.UserName) { return $cs.UserName.Trim() }
  } catch {}
  try {
    $lines = @(& quser 2>$null)
    if ($lines.Count -eq 0) { $lines = @(& query.exe user 2>$null) }
    foreach ($line in $lines | Select-Object -Skip 1) {
      if ($line -match '^\s*>?(?<user>\S+)\s+(?<session>\S+)\s+(?<id>\d+)\s+(?<state>\S+)') {
        if ($Matches['session'] -eq 'console' -or $Matches['state'] -eq 'Active') {
          return $Matches['user']
        }
      }
    }
  } catch {}
  try {
    $p = Get-Process explorer -IncludeUserName -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($p -and $p.UserName) { return $p.UserName }
  } catch {}
  if (-not (Get-IsSystem)) {
    try {
      $user = (whoami 2>$null)
      if ($user) { return $user.Trim() }
    } catch {}
  }
  return ''
}

function Invoke-Interactive {
  # Run a command on the interactive desktop. Under SYSTEM this uses a
  # temporary interactive scheduled task; otherwise it starts the process
  # directly.
  param([string]$FilePath, [string]$ArgumentList = '')
  if (-not (Get-IsSystem)) {
    try {
      if ($ArgumentList) {
        Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WindowStyle Hidden -ErrorAction Stop
      } else {
        Start-Process -FilePath $FilePath -WindowStyle Hidden -ErrorAction Stop
      }
    } catch {}
    return
  }
  $taskName = 'LabCC-Interactive-' + [Guid]::NewGuid().ToString('N')
  $tr = '"{0}" {1}' -f $FilePath, $ArgumentList
  try {
    & schtasks.exe /Create /TN $taskName /TR $tr /SC ONCE /ST 00:00 /RU SYSTEM /IT /RL HIGHEST /F 2>$null | Out-Null
    & schtasks.exe /Run /TN $taskName 2>$null | Out-Null
    Start-Sleep -Milliseconds 800
    & schtasks.exe /Delete /TN $taskName /F 2>$null | Out-Null
  } catch {}
}

function Get-AvStatus {
  $result = @{ enabled = $null; signature = $null; lastScan = $null; scanState = $script:avScanState }
  try {
    $mp = Get-MpComputerStatus -ErrorAction Stop
    $result.enabled = ($mp.AntivirusEnabled -eq $true)
    if ($mp.AntivirusSignatureVersion) { $result.signature = $mp.AntivirusSignatureVersion }
    if ($mp.AntivirusScanEndTime) { $result.lastScan = $mp.AntivirusScanEndTime.ToString('o') }
  } catch {}
  if ($script:avLastScanAt) { $result.lastScan = $script:avLastScanAt.ToString('o') }
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
$script:MessageScriptPath = Join-Path $ConfigDir 'message.ps1'
$script:lastWarningKey = $null
$script:warningActive = $false
$script:idleHelperLoaded = $false
$script:avScanState = 'idle'
$script:avLastScanAt = $null
$script:scanJob = $null
$script:scanAction = $null
$script:lastAuditCheck = $null

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

function Ensure-MessageScript {
  $content = @'
param([string]$Text = '')
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Information
$notify.Visible = $true
$notify.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
$notify.BalloonTipTitle = 'Lab Command Center'
$notify.BalloonTipText = $Text
$notify.ShowBalloonTip(10000)
Start-Sleep -Seconds 10
$notify.Dispose()
'@
  Set-Content -LiteralPath $script:MessageScriptPath -Value $content -Encoding UTF8
}

function Show-PeripheralWarning {
  param([string[]]$Devices)
  Ensure-WarningScript
  $argLine = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -Devices "{1}"' -f $script:WarningScriptPath, ($Devices -join ';')
  Invoke-Interactive -FilePath 'powershell.exe' -ArgumentList $argLine
  $script:warningActive = $true
}

function Stop-PeripheralWarning {
  try {
    $procs = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue)
    foreach ($proc in $procs) {
      if ($proc.CommandLine -like '*peripheral-warning.ps1*') {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {}
  $script:warningActive = $false
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
  Ensure-MessageScript
  $argLine = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -Text "{1}"' -f $script:MessageScriptPath, ($Text -replace '"', '""')
  Invoke-Interactive -FilePath 'powershell.exe' -ArgumentList $argLine
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

function Invoke-SyncScan {
  param($Payload)
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
    Start-MpScan -ScanType QuickScan -ErrorAction Stop
    return @{ success = $true; detail = 'Defender quick scan completed' }
  } catch {
    return @{ success = $false; detail = $_.Exception.Message }
  }
}

function Start-ScanJob {
  param([string]$Type)
  $resultPath = Join-Path $ConfigDir 'scan-result.json'
  Remove-Item -LiteralPath $resultPath -Force -ErrorAction SilentlyContinue
  return Start-Job -ArgumentList $Type, $resultPath -ScriptBlock {
    param($scanType, $outPath)
    try {
      Import-Module Defender -ErrorAction SilentlyContinue
      if ($scanType -eq 'full') {
        Start-MpScan -ScanType FullScan -ErrorAction Stop
      } else {
        Start-MpScan -ScanType QuickScan -ErrorAction Stop
      }
      @{ success = $true; detail = if ($scanType -eq 'full') { 'Defender full scan completed' } else { 'Defender quick scan completed' } } |
        ConvertTo-Json -Compress | Set-Content -LiteralPath $outPath -Encoding UTF8
    } catch {
      @{ success = $false; detail = $_.Exception.Message } |
        ConvertTo-Json -Compress | Set-Content -LiteralPath $outPath -Encoding UTF8
    }
  }
}

function Poll-ScanJob {
  # Called once per loop; finishes a background scan and reports the result.
  if (-not $script:scanJob) { return }
  if ($script:scanJob.State -eq 'Completed') {
    $out = Receive-Job -Job $script:scanJob
    Remove-Job -Job $script:scanJob -Force
    $script:scanJob = $null
    $script:avScanState = 'idle'
    $script:avLastScanAt = Get-Date
    $result = @{ success = $false; detail = 'Scan job completed with no result' }
    $resultPath = Join-Path $ConfigDir 'scan-result.json'
    if (Test-Path -LiteralPath $resultPath) {
      try { $result = (Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json) } catch {}
      Remove-Item -LiteralPath $resultPath -Force -ErrorAction SilentlyContinue
    }
    if ($script:scanAction) {
      $body = @{ token = $config.token; success = ([bool]$result.success) }
      if ($result.detail) { $body.detail = $result.detail }
      try {
        Invoke-ApiJson -Method 'POST' -Path ('/api/agent/actions/{0}/complete' -f $script:scanAction.id) -Body $body | Out-Null
      } catch {}
      $script:scanAction = $null
      if ($result.success) {
        Write-Log ('Action "av_scan" completed - {0}' -f $result.detail)
      } else {
        Write-Log ('Action "av_scan" FAILED: {0}' -f $result.detail)
      }
    }
  } elseif ($script:scanJob.State -in @('Failed', 'Stopped')) {
    Remove-Job -Job $script:scanJob -Force
    $script:scanJob = $null
    $script:avScanState = 'idle'
    if ($script:scanAction) {
      $body = @{ token = $config.token; success = $false; detail = 'Scan job stopped unexpectedly' }
      try {
        Invoke-ApiJson -Method 'POST' -Path ('/api/agent/actions/{0}/complete' -f $script:scanAction.id) -Body $body | Out-Null
      } catch {}
      $script:scanAction = $null
      Write-Log ('Action "av_scan" FAILED: Scan job stopped')
    }
  } else {
    $script:avScanState = 'scanning'
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

function Ensure-AuditPolicy {
  try {
    & auditpol.exe /set /subcategory:"User Account Management" /success:enable /failure:enable 2>$null | Out-Null
  } catch {}
}

function Get-SecurityAccount {
  param($Event, [string]$Field)
  try {
    $xml = [xml]$Event.ToXml()
    foreach ($prop in $xml.Event.EventData.Data) {
      if ($prop.Name -eq $Field) {
        $val = [string]$prop.'#text'
        if ($val) { return $val }
      }
    }
  } catch {}
  return ''
}

function Read-PasswordEvents {
  # Returns new 4723/4724 events since the last cursor, updating it on disk.
  $cfg = Get-Config
  if (-not $cfg) { return }
  $cursor = $null
  if ($cfg.PSObject.Properties.Name -contains 'securityCursor') { $cursor = $cfg.securityCursor }
  $lastRecord = 0
  if ($cfg.PSObject.Properties.Name -contains 'securityLastRecord') { $lastRecord = [long]$cfg.securityLastRecord }

  $found = @()
  try {
    $filter = @{ LogName = 'Security'; Id = 4723, 4724; ErrorAction = 'SilentlyContinue' }
    if ($cursor) {
      try { $filter.StartTime = ([datetime]$cursor).AddMinutes(-1) } catch {}
    }
    $found = @(Get-WinEvent -FilterHashtable $filter -ErrorAction SilentlyContinue |
      Where-Object { $_.Id -in 4723, 4724 -and $_.RecordId -gt $lastRecord } |
      Sort-Object TimeCreated)
  } catch {}

  foreach ($ev in $found) {
    $actor = Get-SecurityAccount $ev 'SubjectUserName'
    $actorDomain = Get-SecurityAccount $ev 'SubjectDomainName'
    $target = Get-SecurityAccount $ev 'TargetUserName'
    $targetDomain = Get-SecurityAccount $ev 'TargetDomainName'
    if (-not $actor) { $actor = 'unknown' }
    if ($target -match '\$$' -or $target -eq 'SYSTEM' -or $target -eq '') { continue }
    $actorFull = if ($actorDomain) { '{0}\{1}' -f $actorDomain, $actor } else { $actor }
    $targetFull = if ($targetDomain) { '{0}\{1}' -f $targetDomain, $target } else { $target }
    $isReset = ($ev.Id -eq 4724)
    $type = if ($isReset) { 'password_reset' } else { 'password_change' }
    $message = if ($isReset) {
      'Password reset on {0} by {1} (account: {2})' -f $env:COMPUTERNAME, $actorFull, $targetFull
    } else {
      'Password changed on {0} by {1} (account: {2})' -f $env:COMPUTERNAME, $actorFull, $targetFull
    }
    $detail = 'actor={0} target={1}' -f $actorFull, $targetFull
    $body = @{ token = $config.token; type = $type; message = $message; detail = $detail }
    try {
      Invoke-ApiJson -Method 'POST' -Path '/api/agent/events' -Body $body | Out-Null
      Write-Log $message
    } catch {}
  }

  if ($found.Count -gt 0) {
    $last = $found[-1]
    $cfg | Add-Member -NotePropertyName securityCursor -NotePropertyValue $last.TimeCreated.ToString('o') -Force
    $cfg | Add-Member -NotePropertyName securityLastRecord -NotePropertyValue $last.RecordId -Force
    Save-Config $cfg
  }
}

function Remove-AutoLogon {
  $key = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
  $changed = $false
  try {
    $props = Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
    if ($props.PSObject.Properties.Name -contains 'AutoAdminLogon' -and [string]$props.AutoAdminLogon -ne '0') {
      Set-ItemProperty -LiteralPath $key -Name 'AutoAdminLogon' -Value '0' -Type String -Force
      $changed = $true
    }
  } catch {}
  foreach ($name in @('DefaultUserName', 'DefaultPassword', 'DefaultDomainName', 'AltDefaultUserName', 'AltDefaultPassword', 'AltDefaultDomainName')) {
    try {
      $props = Get-ItemProperty -LiteralPath $key -Name $name -ErrorAction SilentlyContinue
      if ($props.PSObject.Properties.Name -contains $name) {
        Remove-ItemProperty -LiteralPath $key -Name $name -Force
        $changed = $true
      }
    } catch {}
  }
  return $changed
}

function Enforce-AutoLogon {
  # Disables auto-login at boot so the PC always shows the login screen.
  $cleaned = Remove-AutoLogon
  $cfg = Get-Config
  if (-not $cfg) { return }
  $alreadyCleaned = ($cfg.PSObject.Properties.Name -contains 'autoLogonCleaned') -and $cfg.autoLogonCleaned
  if ($cleaned) {
    if (-not $alreadyCleaned) {
      $body = @{ token = $cfg.token; type = 'autologon'; message = 'Auto-login disabled at boot on {0}' -f $env:COMPUTERNAME; detail = 'Removed AutoAdminLogon/Default* values from Winlogon' }
      try { Invoke-ApiJson -Method 'POST' -Path '/api/agent/events' -Body $body | Out-Null } catch {}
      Write-Log 'Auto-login was enabled; disabled so the PC shows the login page.'
    }
    $cfg | Add-Member -NotePropertyName autoLogonCleaned -NotePropertyValue $true -Force
  } else {
    $cfg | Add-Member -NotePropertyName autoLogonCleaned -NotePropertyValue $false -Force
  }
  Save-Config $cfg
}

function Execute-Action {
  param($Action)
  $actionName = $Action.action
  $payload = @{}
  if ($Action.payload) {
    try { $payload = ($Action.payload | ConvertFrom-Json) } catch {}
  }

  $result = $null
  $defer = $false
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
        if ($payload.path) {
          $result = Invoke-SyncScan $payload
          break
        }
        if ($script:scanJob) {
          $result = @{ success = $false; detail = 'A scan is already running; wait for it to finish.' }
          break
        }
        $type = 'quick'
        if ($payload.type -eq 'full') { $type = 'full' }
        $script:scanJob = Start-ScanJob -Type $type
        $script:scanAction = $Action
        $script:avScanState = 'scanning'
        $defer = $true
        Write-Log ('{0} scan started.' -f $(if ($type -eq 'full') { 'Full' } else { 'Quick' }))
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

  if ($defer) { return }
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
# Install mode: copy the script and register a SYSTEM boot task that covers
# every user (runs before anyone logs in).
# ---------------------------------------------------------------------------
if ($Install) {
  if ([string]::IsNullOrWhiteSpace($ServerUrl)) {
    throw 'Server URL is required with -Install: -Install -ServerUrl https://YOUR-APP.onrender.com'
  }
  New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
  Copy-Item -LiteralPath $MyInvocation.MyCommand.Path -Destination $AgentPath -Force
  & schtasks.exe /Delete /TN $TaskName /F 2>$null | Out-Null
  $taskCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $AgentPath -ServerUrl $ServerUrl"
  & schtasks.exe /Create /TN $TaskName /TR $taskCmd /SC ONSTART /RU SYSTEM /RL HIGHEST /F | Out-Null
  & schtasks.exe /Run /TN $TaskName | Out-Null
  Write-Log 'Installed as a SYSTEM boot task. The agent covers all users and starts before anyone logs in.'
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

# Boot-time tasks: enable security auditing and disable any auto-login.
Ensure-AuditPolicy
$script:lastAuditCheck = Get-Date
Enforce-AutoLogon

try {
  while ($true) {
    try {
      Poll-ScanJob

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
      if ($av.scanState) { $hbBody.avScanState = $av.scanState }
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
              Write-Log ('Ejected unapproved USB drive {0}:' -f $drive.Letter)
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
          Invoke-Interactive -FilePath 'logoff.exe'
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
        if (-not $script:warningActive -or $script:lastWarningKey -ne $missingKey) {
          Stop-PeripheralWarning
          Show-PeripheralWarning -Devices $missing
          $script:lastWarningKey = $missingKey
          Write-Log ('Peripheral warning shown for: {0}' -f ($missing -join ', '))
        }
      } else {
        Stop-PeripheralWarning
      }

      # ---- password change/reset monitoring ----------------------------------
      if (-not $script:lastAuditCheck -or ((Get-Date) - $script:lastAuditCheck).TotalMinutes -ge 10) {
        Ensure-AuditPolicy
        $script:lastAuditCheck = Get-Date
      }
      Read-PasswordEvents
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
