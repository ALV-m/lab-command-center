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
#   * in strict USB modes it disables newly inserted flash drives/phones at the
#     device level (they cannot be used or charged) until approved by the admin
#   * inventories keyboard/mouse/monitor peripherals, warns on-screen (full
#     screen overlay) when a baseline device is disconnected, and reports
#     connect/disconnect to the server with the current user
#   * shows a non-bypassable full-screen login form (Student and Administrator
#     tabs) when a user session starts or after an administrator lock, and
#     records it with the server
#   * monitors the Security log for local account password changes (4723) and
#     password resets (4724) and reports them as alerts/events
#   * applies the lab sign-in method: by default it disables Windows auto-login
#     so PCs land on the Windows password page; with the "login form instead of
#     password" method it creates a local account and enables auto-login so the
#     login form is the only barrier at boot
#   * logs the console user out automatically after a configurable idle time
#   * runs antivirus scans as background jobs and reports scanning status
#   * executes remote actions (lock, restart, message, file push/delete, AV
#     scan/update/toggle, firewall enable/disable, Remote Desktop enable,
#     Wake-on-LAN relay, remote-view screenshot upload)
#   * reports the physical MAC address and IP so the server can send
#     Wake-on-LAN packets through another online PC on the same network
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

$script:AgentVersion = '1.5.0'
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
    macAddress = Get-LocalMacAddress
    ipAddress = Get-LocalIpAddress
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
$script:CheckinScriptPath = Join-Path $ConfigDir 'checkin-gate.ps1'
$script:ScreenshotScriptPath = Join-Path $ConfigDir 'capture-screenshot.ps1'
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

function Get-LocalMacAddress {
  try {
    $adapter = Get-NetAdapter -ErrorAction Stop | Where-Object { $_.Status -eq 'Up' -and $_.MacAddress } | Select-Object -First 1
    if ($adapter -and $adapter.MacAddress) { return ($adapter.MacAddress -replace '[-:]', '').ToLower() }
  } catch {}
  try {
    $adapter = Get-CimInstance Win32_NetworkAdapter -ErrorAction SilentlyContinue | Where-Object { $_.NetConnectionStatus -eq 2 -and $_.MACAddress } | Select-Object -First 1
    if ($adapter -and $adapter.MACAddress) { return ($adapter.MACAddress -replace '[-:]', '').ToLower() }
  } catch {}
  return ''
}

function Get-LocalIpAddress {
  try {
    $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
      $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254*' -and $_.IPAddress -notlike 'fe80:*'
    } | Select-Object -First 1
    if ($ip) { return $ip.IPAddress }
  } catch {}
  return ''
}

function Send-WakeOnLan {
  param([string]$Mac, [int]$Port = 9)
  $macHex = ($Mac -replace '[^0-9a-fA-F]', '').ToLower()
  if ($macHex.Length -ne 12) { throw "Invalid MAC address: $Mac" }
  $payload = New-Object byte[] (6 + 16 * 6)
  for ($i = 0; $i -lt 6; $i++) { $payload[$i] = 0xFF }
  for ($i = 0; $i -lt 16; $i++) {
    for ($j = 0; $j -lt 6; $j++) {
      $payload[6 + $i * 6 + $j] = [Convert]::ToByte($macHex.Substring($j * 2, 2), 16)
    }
  }

  $broadcasts = New-Object System.Collections.Generic.HashSet[string]
  [void]$broadcasts.Add('255.255.255.255')
  try {
    $localIps = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
      $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254*'
    }
    foreach ($local in $localIps) {
      try {
        $mask = (New-Object System.Net.IPAddress ([UInt32](0xFFFFFFFF -shl (32 - $local.PrefixLength)))).GetAddressBytes()
        $addr = [System.Net.IPAddress]::Parse($local.IPAddress).GetAddressBytes()
        $bc = New-Object byte[] 4
        for ($i = 0; $i -lt 4; $i++) { $bc[$i] = $addr[$i] -bor (-bnot $mask[$i]) }
        [void]$broadcasts.Add([string]::Join('.', $bc))
      } catch {}
    }
  } catch {}

  $sent = 0
  foreach ($target in $broadcasts) {
    try {
      $client = New-Object System.Net.Sockets.UdpClient
      try {
        $client.EnableBroadcast = $true
        [void]$client.Send($payload, $payload.Length, $target, $Port)
        $sent++
      } finally { $client.Close() }
    } catch {}
  }
  if ($sent -eq 0) { throw 'Could not send the wake packet on any network interface' }
  return $sent
}

function Get-DriveInstanceId {
  param([string]$Letter)
  if (-not $Letter) { return '' }
  try {
    $part = Get-CimInstance -Query ("ASSOCIATORS OF {{Win32_LogicalDisk.DeviceID='{0}:'}} WHERE AssocClass=Win32_LogicalDiskToPartition" -f $Letter) -ErrorAction Stop | Select-Object -First 1
    if ($part) {
      $disk = Get-CimInstance -Query ("ASSOCIATORS OF {{Win32_DiskPartition.DeviceID='{0}'}} WHERE AssocClass=Win32_DiskToPartition" -f $part.DeviceID) -ErrorAction Stop | Select-Object -First 1
      if ($disk -and $disk.PNPDeviceID) { return [string]$disk.PNPDeviceID }
    }
  } catch {}
  return ''
}

function Get-PhoneDevices {
  $result = @()
  try {
    $devices = @(Get-PnpDevice -Class 'WPD', 'Image', 'PortableDevices' -PresentOnly -ErrorAction SilentlyContinue)
    foreach ($dev in $devices) {
      if (-not $dev.InstanceId) { continue }
      $name = if ($dev.FriendlyName) { $dev.FriendlyName } else { $dev.InstanceId }
      $result += [PSCustomObject]@{
        InstanceId = $dev.InstanceId
        Name = $name
      }
    }
  } catch {}
  return $result
}

function Block-UsbDevice {
  param([string]$InstanceId)
  try {
    Disable-PnpDevice -InstanceId $InstanceId -Confirm:$false -ErrorAction Stop | Out-Null
    return $true
  } catch {}
  try {
    & pnputil.exe /disable-device "$InstanceId" 2>$null | Out-Null
    return $true
  } catch {}
  return $false
}

function Enable-UsbDevice {
  param([string]$InstanceId)
  try {
    Enable-PnpDevice -InstanceId $InstanceId -Confirm:$false -ErrorAction Stop | Out-Null
    return $true
  } catch {}
  try {
    & pnputil.exe /enable-device "$InstanceId" 2>$null | Out-Null
    return $true
  } catch {}
  return $false
}

function Ensure-ScreenshotScript {
  $content = @'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Drawing.Rectangle]::Empty
foreach ($screen in [System.Windows.Forms.Screen]::AllScreens) {
  $bounds = [System.Drawing.Rectangle]::Union($bounds, $screen.Bounds)
}
$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
try {
  $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
} finally {
  $g.Dispose()
}
$out = Join-Path $env:TEMP 'labcc-screenshot.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
'@
  Set-Content -LiteralPath $script:ScreenshotScriptPath -Value $content -Encoding UTF8
}

function Capture-Screenshot {
  Ensure-ScreenshotScript
  $argLine = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $script:ScreenshotScriptPath
  Invoke-Interactive -FilePath 'powershell.exe' -ArgumentList $argLine
  Start-Sleep -Milliseconds 1200
  $path = Join-Path $env:TEMP 'labcc-screenshot.png'
  if (-not (Test-Path -LiteralPath $path)) {
    return @{ success = $false; detail = 'Could not capture the screen (no interactive session?).' }
  }
  try {
    $url = '{0}/api/agent/screenshot?token={1}' -f $ServerUrl, $config.token
    Invoke-RestMethod -Uri $url -Method Post -InFile $path -ContentType 'image/png' -TimeoutSec 60 | Out-Null
    return @{ success = $true; detail = 'Screenshot captured and uploaded.' }
  } catch {
    return @{ success = $false; detail = $_.Exception.Message }
  } finally {
    Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
  }
}

function Ensure-CheckinScript {
  $content = @'
param([string]$ServerUrl = '', [string]$ConfigPath = '', [string]$UserName = '')
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$script:submitted = $false
$script:photoFileId = ''
$script:role = 'student'

function Read-Token {
  try {
    if (-not (Test-Path -LiteralPath $ConfigPath)) { return '' }
    $cfg = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    return [string]$cfg.token
  } catch { return '' }
}

function Upload-Photo {
  param([string]$Path)
  try {
    $token = Read-Token
    $url = '{0}/api/agent/upload?token={1}' -f $ServerUrl, $token
    $resp = Invoke-RestMethod -Uri $url -Method Post -InFile $Path -ContentType 'image/jpeg' -TimeoutSec 60
    return [string]$resp.fileId
  } catch { return '' }
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Sign in to use this computer'
$form.WindowState = [System.Windows.Forms.FormWindowState]::Maximized
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.TopMost = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(240, 242, 245)
$form.KeyPreview = $true

$form.Add_KeyDown({
  param($sender, $e)
  if ($e.Alt -and $e.KeyCode -eq [System.Windows.Forms.Keys]::F4) { $e.SuppressKeyPress = $true }
  if ($e.KeyCode -eq [System.Windows.Forms.Keys]::Escape) { $e.SuppressKeyPress = $true }
})

$form.Add_FormClosing({
  param($sender, $e)
  if (-not $script:submitted) { $e.Cancel = $true }
})

$panel = New-Object System.Windows.Forms.Panel
$panel.Dock = [System.Windows.Forms.DockStyle]::Fill
$panel.Padding = New-Object System.Windows.Forms.Padding(24)
$form.Controls.Add($panel)

$flow = New-Object System.Windows.Forms.FlowLayoutPanel
$flow.Dock = [System.Windows.Forms.DockStyle]::Fill
$flow.FlowDirection = [System.Windows.Forms.FlowDirection]::TopDown
$flow.WrapContents = $false
$flow.AutoScroll = $true
$panel.Controls.Add($flow)

function New-Heading {
  param([string]$Text, [System.Drawing.Color]$Color, [int]$Size)
  $label = New-Object System.Windows.Forms.Label
  $label.Text = $Text
  $label.Font = New-Object System.Drawing.Font('Segoe UI', $Size, [System.Drawing.FontStyle]::Bold)
  $label.ForeColor = $Color
  $label.AutoSize = $true
  $label.Margin = New-Object System.Windows.Forms.Padding(0, 12, 0, 4)
  return $label
}

function New-Textbox {
  param([string]$Placeholder, [bool]$Required = $true)
  $box = New-Object System.Windows.Forms.TextBox
  $box.Font = New-Object System.Drawing.Font('Segoe UI', 14)
  $box.Width = 380
  $box.Margin = New-Object System.Windows.Forms.Padding(0, 4, 0, 4)
  return $box
}

$flow.Controls.Add((New-Heading -Text 'SIGN IN TO USE THIS COMPUTER' -Color ([System.Drawing.Color]::FromArgb(200, 30, 30)) -Size 28))
$flow.Controls.Add((New-Heading -Text 'Choose Student or Administrator and complete the form before using this computer.' -Color ([System.Drawing.Color]::FromArgb(80, 80, 90)) -Size 13))

$tabs = New-Object System.Windows.Forms.TabControl
$tabs.Dock = [System.Windows.Forms.DockStyle]::Top
$tabs.Height = 430
$tabs.Font = New-Object System.Drawing.Font('Segoe UI', 11)
$tabs.Margin = New-Object System.Windows.Forms.Padding(0, 10, 0, 0)
$flow.Controls.Add($tabs)

$tabStudent = New-Object System.Windows.Forms.TabPage
$tabStudent.Text = 'Student'
$tabStudent.BackColor = [System.Drawing.Color]::White
$tabs.TabPages.Add($tabStudent)

$tabAdmin = New-Object System.Windows.Forms.TabPage
$tabAdmin.Text = 'Administrator'
$tabAdmin.BackColor = [System.Drawing.Color]::White
$tabs.TabPages.Add($tabAdmin)

$tabs.Add_SelectedIndexChanged({
  param($sender, $e)
  if ($tabs.SelectedTab -eq $tabAdmin) { $script:role = 'admin' } else { $script:role = 'student' }
})

$studentFlow = New-Object System.Windows.Forms.FlowLayoutPanel
$studentFlow.Dock = [System.Windows.Forms.DockStyle]::Fill
$studentFlow.FlowDirection = [System.Windows.Forms.FlowDirection]::TopDown
$studentFlow.WrapContents = $false
$studentFlow.AutoScroll = $true
$studentFlow.Padding = New-Object System.Windows.Forms.Padding(8)
$studentFlow.BackColor = [System.Drawing.Color]::White
$tabStudent.Controls.Add($studentFlow)

$nameBox = New-Textbox
$phoneBox = New-Textbox
$admissionBox = New-Textbox
$emailBox = New-Textbox

$studentFlow.Controls.Add((New-Heading -Text 'Full name *' -Color ([System.Drawing.Color]::FromArgb(60, 60, 70)) -Size 12))
$studentFlow.Controls.Add($nameBox)
$studentFlow.Controls.Add((New-Heading -Text 'Phone number *' -Color ([System.Drawing.Color]::FromArgb(60, 60, 70)) -Size 12))
$studentFlow.Controls.Add($phoneBox)
$studentFlow.Controls.Add((New-Heading -Text 'Admission / ID number *' -Color ([System.Drawing.Color]::FromArgb(60, 60, 70)) -Size 12))
$studentFlow.Controls.Add($admissionBox)
$studentFlow.Controls.Add((New-Heading -Text 'Email (optional)' -Color ([System.Drawing.Color]::FromArgb(60, 60, 70)) -Size 12))
$studentFlow.Controls.Add($emailBox)

$photoRow = New-Object System.Windows.Forms.FlowLayoutPanel
$photoRow.FlowDirection = [System.Windows.Forms.FlowDirection]::LeftToRight
$photoRow.AutoSize = $true
$photoRow.Margin = New-Object System.Windows.Forms.Padding(0, 8, 0, 0)

$photoBox = New-Object System.Windows.Forms.PictureBox
$photoBox.Size = New-Object System.Drawing.Size(120, 120)
$photoBox.BackColor = [System.Drawing.Color]::White
$photoBox.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
$photoBox.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
$photoBox.Visible = $false

$photoButton = New-Object System.Windows.Forms.Button
$photoButton.Text = 'Take photo (optional)'
$photoButton.Font = New-Object System.Drawing.Font('Segoe UI', 11)
$photoButton.Width = 200
$photoButton.Height = 40
$photoButton.Add_Click({
  try {
    $dm = New-Object -ComObject WIA.DeviceManager
    $cam = $dm.DeviceInfos | Where-Object { $_.Type -eq 3 } | Select-Object -First 1
    if (-not $cam) { [System.Windows.Forms.MessageBox]::Show('No camera was found on this computer.', 'Lab Command Center') | Out-Null; return }
    $device = $cam.Connect()
    $captured = $device.ExecuteCommand('{AF933CAC-AC7D-4D13-9E27-84A7C3E4D5C4}')
    $shotPath = Join-Path $env:TEMP ('labcc-photo-{0}.jpg' -f [guid]::NewGuid().ToString('N'))
    $captured.SaveFile($shotPath)
    $script:photoFileId = Upload-Photo $shotPath
    $photoBox.Image = [System.Drawing.Image]::FromFile($shotPath)
    $photoBox.Visible = $true
    Remove-Item -LiteralPath $shotPath -Force -ErrorAction SilentlyContinue
  } catch {
    [System.Windows.Forms.MessageBox]::Show(('Could not take a photo: {0}' -f $_.Exception.Message), 'Lab Command Center') | Out-Null
  }
})

$photoRow.Controls.Add($photoButton)
$photoRow.Controls.Add($photoBox)
$studentFlow.Controls.Add($photoRow)

$adminFlow = New-Object System.Windows.Forms.FlowLayoutPanel
$adminFlow.Dock = [System.Windows.Forms.DockStyle]::Fill
$adminFlow.FlowDirection = [System.Windows.Forms.FlowDirection]::TopDown
$adminFlow.WrapContents = $false
$adminFlow.AutoScroll = $true
$adminFlow.Padding = New-Object System.Windows.Forms.Padding(8)
$adminFlow.BackColor = [System.Drawing.Color]::White
$tabAdmin.Controls.Add($adminFlow)

$adminUserBox = New-Object System.Windows.Forms.TextBox
$adminUserBox.Font = New-Object System.Drawing.Font('Segoe UI', 14)
$adminUserBox.Width = 380
$adminUserBox.Margin = New-Object System.Windows.Forms.Padding(0, 4, 0, 4)

$adminPassBox = New-Object System.Windows.Forms.TextBox
$adminPassBox.Font = New-Object System.Drawing.Font('Segoe UI', 14)
$adminPassBox.Width = 380
$adminPassBox.Margin = New-Object System.Windows.Forms.Padding(0, 4, 0, 4)
$adminPassBox.UseSystemPasswordChar = $true

$adminFlow.Controls.Add((New-Heading -Text 'Administrator username *' -Color ([System.Drawing.Color]::FromArgb(60, 60, 70)) -Size 12))
$adminFlow.Controls.Add($adminUserBox)
$adminFlow.Controls.Add((New-Heading -Text 'Passphrase *' -Color ([System.Drawing.Color]::FromArgb(60, 60, 70)) -Size 12))
$adminFlow.Controls.Add($adminPassBox)
$adminFlow.Controls.Add((New-Heading -Text 'Signing in as administrator records the sign-in in the check-in log and opens the lab dashboard for managing computers.' -Color ([System.Drawing.Color]::FromArgb(120, 120, 130)) -Size 11))

$status = New-Object System.Windows.Forms.Label
$status.ForeColor = [System.Drawing.Color]::FromArgb(200, 30, 30)
$status.Font = New-Object System.Drawing.Font('Segoe UI', 11)
$status.AutoSize = $true
$status.Margin = New-Object System.Windows.Forms.Padding(0, 8, 0, 0)
$flow.Controls.Add($status)

$submit = New-Object System.Windows.Forms.Button
$submit.Text = 'Sign in'
$submit.Font = New-Object System.Drawing.Font('Segoe UI', 13, [System.Drawing.FontStyle]::Bold)
$submit.BackColor = [System.Drawing.Color]::FromArgb(24, 108, 220)
$submit.ForeColor = [System.Drawing.Color]::White
$submit.Width = 200
$submit.Height = 46
$submit.Margin = New-Object System.Windows.Forms.Padding(0, 14, 0, 0)
$submit.Add_Click({
  if ($script:role -eq 'admin') {
    $adminUser = $adminUserBox.Text.Trim()
    $adminPass = $adminPassBox.Text
    if (-not $adminUser -or -not $adminPass) {
      $status.Text = 'Enter your administrator username and passphrase.'
      return
    }
    $submit.Enabled = $false
    $status.Text = 'Signing in…'
    try {
      $token = Read-Token
      $body = @{
        token = $token
        userName = $UserName
        role = 'admin'
        studentName = $adminUser
        adminUser = $adminUser
        adminPass = $adminPass
      }
      $json = $body | ConvertTo-Json -Compress -Depth 4
      $resp = Invoke-RestMethod -Uri ('{0}/api/agent/checkin' -f $ServerUrl) -Method Post -ContentType 'application/json' -Body $json -TimeoutSec 60
      if ($resp.ok) {
        $script:submitted = $true
        $form.Close()
        Start-Process ('{0}/' -f $ServerUrl) -ErrorAction SilentlyContinue
      } else {
        $status.Text = [string]$resp.error
        $submit.Enabled = $true
      }
    } catch {
      $status.Text = 'Could not reach the server. Try again in a moment.'
      $submit.Enabled = $true
    }
  } else {
    $name = $nameBox.Text.Trim()
    $phone = $phoneBox.Text.Trim()
    $admission = $admissionBox.Text.Trim()
    if (-not $name -or -not $phone -or -not $admission) {
      $status.Text = 'Please fill in your name, phone number, and admission number.'
      return
    }
    $submit.Enabled = $false
    $status.Text = 'Submitting…'
    try {
      $token = Read-Token
      $body = @{
        token = $token
        userName = $UserName
        role = 'student'
        studentName = $name
        phone = $phone
        admissionNo = $admission
        email = ($emailBox.Text.Trim() -replace '\s+', ' ')
        photoFileId = $script:photoFileId
      }
      $json = $body | ConvertTo-Json -Compress -Depth 4
      $resp = Invoke-RestMethod -Uri ('{0}/api/agent/checkin' -f $ServerUrl) -Method Post -ContentType 'application/json' -Body $json -TimeoutSec 60
      if ($resp.ok) {
        $script:submitted = $true
        $form.Close()
      } else {
        $status.Text = [string]$resp.error
        $submit.Enabled = $true
      }
    } catch {
      $status.Text = 'Could not reach the server. Try again in a moment.'
      $submit.Enabled = $true
    }
  }
})
$flow.Controls.Add($submit)

[System.Windows.Forms.Application]::Run($form)
'@
  Set-Content -LiteralPath $script:CheckinScriptPath -Value $content -Encoding UTF8
}

function Get-CheckinGateRunning {
  try {
    $procs = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue)
    foreach ($proc in $procs) {
      if ($proc.CommandLine -like '*checkin-gate.ps1*') { return $true }
    }
  } catch {}
  return $false
}

function Stop-CheckinGate {
  try {
    $procs = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue)
    foreach ($proc in $procs) {
      if ($proc.CommandLine -like '*checkin-gate.ps1*') {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {}
}

function Show-CheckinGate {
  param([string]$UserName)
  Ensure-CheckinScript
  $argLine = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -ServerUrl "{1}" -ConfigPath "{2}" -UserName "{3}"' -f $script:CheckinScriptPath, $ServerUrl, $ConfigPath, ($UserName -replace '"', '""')
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
  if ($Payload.destination) {
    $custom = [string]$Payload.destination
    if ([System.IO.Path]::IsPathRooted($custom)) {
      $dest = $custom
    } else {
      $dest = Join-Path $dest $custom
    }
  }
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  $destPath = Join-Path $dest $fileName
  $url = '{0}/api/agent/files/download/{1}?token={2}' -f $ServerUrl, $Payload.fileId, $config.token
  Invoke-WebRequest -Uri $url -OutFile $destPath -UseBasicParsing -TimeoutSec 120
  return @{ success = $true; detail = ('Saved to {0}' -f $destPath) }
}

function Get-DirListing {
  param([string]$Path)
  if (-not $Path) { $Path = 'C:\' }
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    throw ('Directory not found: {0}' -f $Path)
  }
  $entries = @()
  Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue | ForEach-Object {
    $isDir = $_.PSIsContainer
    $size = 0
    $modified = $null
    try {
      if (-not $isDir) { $size = [long]$_.Length }
      $modified = $_.LastWriteTime.ToString('o')
    } catch {}
    $entries += @{
      name = $_.Name
      isDir = $isDir
      size = $size
      modifiedAt = $modified
    }
  }
  return @{ path = $Path; entries = $entries }
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

function Ensure-SharedAccount {
  param([string]$UserName, [string]$Password)
  try {
    if (-not (Get-LocalUser -Name $UserName -ErrorAction SilentlyContinue)) {
      New-LocalUser -Name $UserName -Password (ConvertTo-SecureString $Password -AsPlainText -Force) -PasswordNeverExpires -AccountNeverExpires | Out-Null
      Write-Log ('Created shared local account {0}' -f $UserName)
    }
    Add-LocalGroupMember -Group 'Users' -Member $UserName -ErrorAction SilentlyContinue
    return $true
  } catch {
    Write-Log ('Could not ensure shared account {0}: {1}' -f $UserName, $_.Exception.Message)
    return $false
  }
}

function Set-SharedAutoLogon {
  param([string]$UserName, [string]$Password)
  $key = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
  $changed = $false
  try {
    $props = Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
    $currentAuto = if ($props.PSObject.Properties.Name -contains 'AutoAdminLogon') { [string]$props.AutoAdminLogon } else { '' }
    $currentUser = if ($props.PSObject.Properties.Name -contains 'DefaultUserName') { [string]$props.DefaultUserName } else { '' }
    $currentPass = if ($props.PSObject.Properties.Name -contains 'DefaultPassword') { [string]$props.DefaultPassword } else { '' }
    $currentDomain = if ($props.PSObject.Properties.Name -contains 'DefaultDomainName') { [string]$props.DefaultDomainName } else { '' }
    $targetDomain = $env:COMPUTERNAME
    if ($currentAuto -ne '1' -or $currentUser -ne $UserName -or $currentPass -ne $Password -or $currentDomain -ne $targetDomain) {
      Set-ItemProperty -LiteralPath $key -Name 'AutoAdminLogon' -Value '1' -Type String -Force
      Set-ItemProperty -LiteralPath $key -Name 'DefaultUserName' -Value $UserName -Type String -Force
      Set-ItemProperty -LiteralPath $key -Name 'DefaultPassword' -Value $Password -Type String -Force
      Set-ItemProperty -LiteralPath $key -Name 'DefaultDomainName' -Value $targetDomain -Type String -Force
      $changed = $true
    }
    # Windows 10/11: Windows Hello "passwordless sign-in" silently blocks
    # AutoAdminLogon on password-protected accounts. Force the build version
    # value to 0 so the account still auto-logs in and the login form shows.
    $pwLessKey = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\PasswordLess\Device'
    $pwLessProps = Get-ItemProperty -LiteralPath $pwLessKey -ErrorAction SilentlyContinue
    $currentPwLess = if ($pwLessProps -and $pwLessProps.PSObject.Properties.Name -contains 'DevicePasswordLessBuildVersion') { [int]$pwLessProps.DevicePasswordLessBuildVersion } else { $null }
    if ($currentPwLess -ne 0) {
      if (-not (Test-Path -LiteralPath $pwLessKey)) { New-Item -Path $pwLessKey -Force | Out-Null }
      Set-ItemProperty -LiteralPath $pwLessKey -Name 'DevicePasswordLessBuildVersion' -Value 0 -Type DWord -Force
      $changed = $true
    }
  } catch {
    Write-Log ('Could not configure auto-login: {0}' -f $_.Exception.Message)
  }
  return $changed
}

function Apply-SigninMethod {
  # Enforces the lab's sign-in method: "login form instead of password"
  # auto-login when configured, otherwise it disables auto-login so the PC
  # always shows the Windows password page.
  $cfg = Get-Config
  if (-not $cfg) { return }
  $method = ''
  if ($cfg.PSObject.Properties.Name -contains 'signinMethod') { $method = [string]$cfg.signinMethod }
  $user = ''
  if ($cfg.PSObject.Properties.Name -contains 'sharedAccountUser') { $user = [string]$cfg.sharedAccountUser }
  $pass = ''
  if ($cfg.PSObject.Properties.Name -contains 'sharedAccountPassword') { $pass = [string]$cfg.sharedAccountPassword }
  if ($method -eq 'shared_account' -and $user -and $pass) {
    if (Ensure-SharedAccount -UserName $user -Password $pass) {
      $enabled = Set-SharedAutoLogon -UserName $user -Password $pass
      $cfg | Add-Member -NotePropertyName autoLogonCleaned -NotePropertyValue $false -Force
      Save-Config $cfg
      if ($enabled) {
        $body = @{ token = $cfg.token; type = 'autologon'; message = 'Auto-login enabled on {0}' -f $env:COMPUTERNAME; detail = ('Auto-login set for {0}' -f $user) }
        try { Invoke-ApiJson -Method 'POST' -Path '/api/agent/events' -Body $body | Out-Null } catch {}
        Write-Log ('Auto-login configured for {0}' -f $user)
      }
    }
  } else {
    $cleaned = Remove-AutoLogon
    $alreadyCleaned = ($cfg.PSObject.Properties.Name -contains 'autoLogonCleaned') -and $cfg.autoLogonCleaned
    if ($cleaned) {
      if (-not $alreadyCleaned) {
        $body = @{ token = $cfg.token; type = 'autologon'; message = 'Auto-login disabled on {0}' -f $env:COMPUTERNAME; detail = 'Removed AutoAdminLogon/Default* values from Winlogon' }
        try { Invoke-ApiJson -Method 'POST' -Path '/api/agent/events' -Body $body | Out-Null } catch {}
        Write-Log 'Auto-login was enabled; disabled so the PC shows the login page.'
      }
      $cfg | Add-Member -NotePropertyName autoLogonCleaned -NotePropertyValue $true -Force
    } else {
      $cfg | Add-Member -NotePropertyName autoLogonCleaned -NotePropertyValue $false -Force
    }
    Save-Config $cfg
  }
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
        $result = @{ success = $true; detail = 'Workstation locked; check-in will be required to use it again.' }
        break
      }
      'unlock' {
        Stop-CheckinGate
        $result = @{ success = $true; detail = 'Computer unlocked; check-in requirement cleared.' }
        break
      }
      'restart' {
        & shutdown.exe /r /t 30 /c "Lab Command Center: restart requested" /f 2>$null
        $result = @{ success = $true; detail = 'Restart scheduled in 30 seconds.' }
        break
      }
      'wake' {
        $result = @{ success = $true; detail = 'Wake-on-LAN is relayed by another online computer.' }
        break
      }
      'wol_relay' {
        try {
          $targetMac = [string]$payload.targetMac
          if (-not $targetMac) { $result = @{ success = $false; detail = 'Missing target MAC.' } ; break }
          $sent = Send-WakeOnLan -Mac $targetMac
          $result = @{ success = $true; detail = ('Wake packet for {0} sent on {1} interface(s).' -f $targetMac, $sent) }
        } catch {
          $result = @{ success = $false; detail = $_.Exception.Message }
        }
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
        $result = Capture-Screenshot
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
      'list_files' {
        $target = 'C:\'
        if ($payload.path) { $target = [string]$payload.path }
        try {
          $listing = Get-DirListing -Path $target
          $body = @{ token = $config.token; path = $listing.path; entries = $listing.entries }
          Invoke-ApiJson -Method 'POST' -Path '/api/agent/files/list' -Body $body | Out-Null
          $result = @{ success = $true; detail = ('Listed {0} item(s) in {1}' -f @($listing.entries).Count, $listing.path) }
        } catch {
          $result = @{ success = $false; detail = $_.Exception.Message }
        }
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

# Boot-time tasks: enable security auditing and apply the lab sign-in method.
Ensure-AuditPolicy
$script:lastAuditCheck = Get-Date
Apply-SigninMethod

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
        macAddress = Get-LocalMacAddress
        ipAddress = Get-LocalIpAddress
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

      # ---- sign-in method (auto-login) --------------------------------------
      $cfgNow = Get-Config
      if ($cfgNow -and $null -ne $hb.computer.signinMethod) {
        $cfgNow | Add-Member -NotePropertyName signinMethod -NotePropertyValue ([string]$hb.computer.signinMethod) -Force
        $cfgNow | Add-Member -NotePropertyName sharedAccountUser -NotePropertyValue ([string]$hb.computer.sharedAccountUser) -Force
        $cfgNow | Add-Member -NotePropertyName sharedAccountPassword -NotePropertyValue ([string]$hb.computer.sharedAccountPassword) -Force
        Save-Config $cfgNow
      }
      Apply-SigninMethod

      # ---- check-in gate -----------------------------------------------------
      $isSystemUser = ($user -match '(?i)^nt authority\\') -or ($user -match '\$$')
      if ($user -and -not $isSystemUser) {
        $cfgNow = Get-Config
        $gateForUser = ''
        if ($cfgNow.PSObject.Properties.Name -contains 'gateUser') { $gateForUser = [string]$cfgNow.gateUser }
        $gateNeeded = ($hb.computer.checkinRequired -eq $true) -or ($gateForUser -ne $user)
        if ($gateNeeded -and -not (Get-CheckinGateRunning)) {
          Show-CheckinGate -UserName $user
          $cfgNow | Add-Member -NotePropertyName gateUser -NotePropertyValue $user -Force
          Save-Config $cfgNow
          Write-Log ('Check-in gate shown for user {0}' -f $user)
        }
      }

      # ---- USB handling ---------------------------------------------------
      $restrictive = ($hb.computer.usbState -eq 'blocked') -or ($hb.computer.usbState -eq 'review')
      $approvedIds = @()
      if ($hb.allowedDeviceIds) { $approvedIds = @($hb.allowedDeviceIds) }

      # Re-enable devices the administrator has approved
      $cfgNow = Get-Config
      $blockedDevices = @()
      if ($cfgNow -and $cfgNow.PSObject.Properties.Name -contains 'blockedUsbDevices') { $blockedDevices = @($cfgNow.blockedUsbDevices) }
      if ($blockedDevices.Count -gt 0) {
        $remaining = @()
        foreach ($entry in $blockedDevices) {
          $instanceId = [string]$entry.instanceId
          if ($instanceId -and ($approvedIds -contains $instanceId)) {
            Enable-UsbDevice -InstanceId $instanceId
            Write-Log ('USB device approved and re-enabled: {0}' -f $instanceId)
          } else {
            $remaining += $entry
          }
        }
        if ($cfgNow) {
          $cfgNow | Add-Member -NotePropertyName blockedUsbDevices -NotePropertyValue @($remaining) -Force
          Save-Config $cfgNow
        }
      }

      $drives = Get-RemovableDrives
      $currentKeys = @()
      foreach ($drive in $drives) {
        $key = Get-UsbKey $drive
        $currentKeys += $key
        if ($script:seenUsb -notcontains $key) {
          $script:seenUsb += $key
          $allowedByLetter = $hb.allowedUsb -and ($hb.allowedUsb -contains $drive.Letter)
          $detail = 'Drive {0}: {1} serial={2}' -f $drive.Letter, $drive.Label, $drive.Serial
          $scanNote = ''
          try {
            $mp = Get-MpComputerStatus -ErrorAction SilentlyContinue
            if ($mp -and ($mp.AntivirusEnabled -eq $true)) {
              Start-MpScan -ScanPath ('{0}:\' -f $drive.Letter) -ScanType QuickScan -ErrorAction SilentlyContinue | Out-Null
              $scanNote = ' Defender scan completed.'
            }
          } catch {}
          if ($restrictive -and -not $allowedByLetter) {
            $instanceId = Get-DriveInstanceId -Letter $drive.Letter
            if ($instanceId) {
              Block-UsbDevice -InstanceId $instanceId
              $cfgNow = Get-Config
              $existing = @()
              if ($cfgNow -and $cfgNow.PSObject.Properties.Name -contains 'blockedUsbDevices') { $existing = @($cfgNow.blockedUsbDevices) }
              $existing += [PSCustomObject]@{ instanceId = $instanceId; key = $key; letter = $drive.Letter }
              if ($cfgNow) {
                $cfgNow | Add-Member -NotePropertyName blockedUsbDevices -NotePropertyValue @($existing) -Force
                Save-Config $cfgNow
              }
              $detail += ' instanceId={0} (blocked, awaiting approval)' -f $instanceId
              Write-Log ('USB drive blocked: {0}' -f $detail)
            } else {
              try {
                $shell = New-Object -ComObject Shell.Application
                $item = $shell.Namespace(17).ParseName(('{0}:' -f $drive.Letter))
                if ($item) { $item.InvokeVerb('Eject') }
              } catch {}
              $detail += ' (ejected, awaiting approval)'
            }
          }
          $eventBody = @{ token = $config.token; type = 'usb_connected'; detail = $detail; message = $scanNote }
          try { Invoke-ApiJson -Method 'POST' -Path '/api/agent/events' -Body $eventBody | Out-Null } catch {}
          Write-Log ('USB device detected: {0}' -f $detail)
        }
      }
      $script:seenUsb = @($script:seenUsb | Where-Object { $currentKeys -contains $_ })

      # Phones / portable devices (no drive letter): block usage when restrictive
      foreach ($phone in (Get-PhoneDevices)) {
        $key = ('instanceId={0}' -f $phone.InstanceId)
        if ($script:seenUsb -notcontains $key) {
          $script:seenUsb += $key
          if ($restrictive -and ($approvedIds -notcontains $phone.InstanceId)) {
            Block-UsbDevice -InstanceId $phone.InstanceId
            $cfgNow = Get-Config
            $existing = @()
            if ($cfgNow -and $cfgNow.PSObject.Properties.Name -contains 'blockedUsbDevices') { $existing = @($cfgNow.blockedUsbDevices) }
            $existing += [PSCustomObject]@{ instanceId = $phone.InstanceId; key = $key; letter = '' }
            if ($cfgNow) {
              $cfgNow | Add-Member -NotePropertyName blockedUsbDevices -NotePropertyValue @($existing) -Force
              Save-Config $cfgNow
            }
            Write-Log ('Portable device blocked: {0}' -f $phone.Name)
          }
          $detail = 'Portable device: {0} instanceId={1}' -f $phone.Name, $phone.InstanceId
          if ($restrictive -and ($approvedIds -notcontains $phone.InstanceId)) { $detail += ' (blocked, awaiting approval)' }
          $eventBody = @{ token = $config.token; type = 'usb_connected'; detail = $detail; message = '' }
          try { Invoke-ApiJson -Method 'POST' -Path '/api/agent/events' -Body $eventBody | Out-Null } catch {}
        }
      }

      # Eject any remaining unapproved removable drives
      if ($restrictive) {
        foreach ($drive in $drives) {
          if ($hb.allowedUsb -and ($hb.allowedUsb -contains $drive.Letter)) { continue }
          try {
            $shell = New-Object -ComObject Shell.Application
            $item = $shell.Namespace(17).ParseName(('{0}:' -f $drive.Letter))
            if ($item) { $item.InvokeVerb('Eject') }
            Write-Log ('Ejected unapproved USB drive {0}:' -f $drive.Letter)
          } catch {}
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
