$ErrorActionPreference = 'SilentlyContinue'
$pids = (Get-NetTCPConnection -LocalPort 3000 -State Listen).OwningProcess | Sort-Object -Unique
foreach ($p in $pids) {
    $e = Get-Process -Id $p -ErrorAction SilentlyContinue
    if ($e) {
        $e | Select-Object Id, ProcessName, Path, StartTime | Format-Table -AutoSize
        $cmdline = (Get-CimInstance Win32_Process -Filter "ProcessId=$p").CommandLine
        Write-Host "Cmdline: $cmdline"
    }
}
