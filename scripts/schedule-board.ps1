<#
.SYNOPSIS
  Registers (or removes) the daily Windows Task Scheduler job for the public GJU board.

.DESCRIPTION
  Runs `npm run board:search -- --publish` from this repository once a day. If the PC was off at the
  chosen time, the task runs as soon as the PC is available again. Nothing is registered until you run
  this script yourself.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\schedule-board.ps1 -Time 07:30
  powershell -ExecutionPolicy Bypass -File scripts\schedule-board.ps1 -Remove
#>
param(
  [string]$Time = "07:30",
  [string]$Name = "CareerToAI-GJU-Board",
  [switch]$Remove
)

if ($Remove) {
  Unregister-ScheduledTask -TaskName $Name -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Removed the scheduled task '$Name' (if it existed)."
  exit 0
}

$repo = Split-Path -Parent $PSScriptRoot
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$log = Join-Path $repo "data\board-task.log"
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"`"$npm`" run board:search -- --publish >> `"$log`" 2>&1`"" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $Name -Action $action -Trigger $trigger -Settings $settings -Description "Daily search for the public GJU internship board" -Force | Out-Null
Write-Host "Registered '$Name' to run daily at $Time. Output goes to $log."
Write-Host "Test it now with:  Start-ScheduledTask -TaskName $Name"
