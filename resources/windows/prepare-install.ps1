# Close OnlyKey, delete the previous install tree, and unlock files that are
# still mapped so NSIS can copy the new one.
#
# Close-to-tray is the default, so a window close only hides nw.exe. The
# process keeps Chromium DLLs such as d3dcompiler_47.dll mapped. A loaded
# image can be renamed. Those files are removed once the lock clears. If the
# lock lasts through setup, they are removed on the next boot. That does not
# ask the user to reboot.
#
# ONLYKEY_REMOVE_PENDING=1 deletes only *.pending-delete-* files and leaves
# the new payload in place. The installer runs that after the new files exist.
#
# The directory comes from ONLYKEY_INSTALL_DIR (set by the installer).
# ONLYKEY_SKIP_REBOOT_DELETE=1 skips the reboot-delete registration. Tests set
# it so a temp file is not written into PendingFileRenameOperations.
#
# Exit codes:
#   0  directory is ready to replace
#   1  install directory was not provided or could not be read
#   2  a process is still running, or a locked file could not be moved
#   3  refused (drive root)

$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'SilentlyContinue'
$utf8 = New-Object System.Text.UTF8Encoding $false
$OutputEncoding = $utf8
try { [Console]::OutputEncoding = $utf8 } catch { }

# DRIVE-ROOT-GUARD
$dir = $env:ONLYKEY_INSTALL_DIR
if ([string]::IsNullOrWhiteSpace($dir)) {
    Write-Output 'ONLYKEY_INSTALL_DIR is not set.'
    exit 1
}

try {
    $full = [System.IO.Path]::GetFullPath($dir)
} catch {
    Write-Output 'Install directory is not a usable path.'
    exit 1
}

$info = New-Object System.IO.DirectoryInfo $full
if ($null -eq $info.Parent) {
    Write-Output 'Refusing to close programs for a drive root.'
    exit 3
}

# DirectoryInfo has no PSIsContainer property. Treating a missing one as
# "not a directory" made every real install folder return before unlock.
if (-not $info.Exists) {
    exit 0
}

$script:root = $info.FullName.TrimEnd('\') + '\'
$script:scheduleDelete = $env:ONLYKEY_SKIP_REBOOT_DELETE -ne '1'
$taskkill = Join-Path $env:SystemRoot 'System32\taskkill.exe'

function ConvertTo-LongPath([string] $path) {
    if ([string]::IsNullOrWhiteSpace($path)) { return '' }
    try {
        return (Get-Item -LiteralPath $path -Force -ErrorAction Stop).FullName
    } catch {
        try { return [System.IO.Path]::GetFullPath($path) } catch { return '' }
    }
}

function Test-UnderInstall([string] $path) {
    $fullPath = ConvertTo-LongPath $path
    if ([string]::IsNullOrWhiteSpace($fullPath)) { return $false }
    return $fullPath.StartsWith($script:root, [System.StringComparison]::OrdinalIgnoreCase)
}

# PROCESS-ENUM
function Get-InstallProcessIds {
    $ids = New-Object System.Collections.Generic.List[int]
    try {
        $procs = Get-CimInstance Win32_Process -ErrorAction Stop
        foreach ($proc in $procs) {
            if (Test-UnderInstall $proc.ExecutablePath) {
                [void]$ids.Add([int]$proc.ProcessId)
            }
        }
    } catch {
        foreach ($proc in @(Get-Process -ErrorAction SilentlyContinue)) {
            $procPath = $null
            try { $procPath = $proc.Path } catch { continue }
            if (Test-UnderInstall $procPath) {
                [void]$ids.Add([int]$proc.Id)
            }
        }
    }
    foreach ($id in $ids) { Write-Output $id }
}

function Clear-ReadOnlyAttribute([string] $path) {
    try {
        $attr = [System.IO.File]::GetAttributes($path)
        $readOnly = [int][System.IO.FileAttributes]::ReadOnly
        if (([int]$attr -band $readOnly) -eq 0) { return }
        $cleared = [System.IO.FileAttributes]([int]$attr -band (-bnot $readOnly))
        [System.IO.File]::SetAttributes($path, $cleared)
    } catch {
        # The file can still be replaced if the read-only bit was already clear.
    }
}

function Get-InstallFiles([string] $rootDir) {
    $files = New-Object System.Collections.Generic.List[string]
    $stack = New-Object System.Collections.ArrayList
    [void]$stack.Add($rootDir.TrimEnd('\'))
    Clear-ReadOnlyAttribute $rootDir.TrimEnd('\')

    while ($stack.Count -gt 0) {
        $current = [string]$stack[$stack.Count - 1]
        $stack.RemoveAt($stack.Count - 1)
        $entries = $null
        try {
            $entries = [System.IO.Directory]::EnumerateFileSystemEntries($current)
        } catch {
            continue
        }
        foreach ($entry in $entries) {
            $attr = $null
            try { $attr = [System.IO.File]::GetAttributes($entry) } catch { continue }
            $flags = [int]$attr
            $reparse = [int][System.IO.FileAttributes]::ReparsePoint
            $directory = [int][System.IO.FileAttributes]::Directory
            if (($flags -band $reparse) -ne 0) { continue }
            if (($flags -band $directory) -ne 0) {
                Clear-ReadOnlyAttribute $entry
                [void]$stack.Add($entry)
                continue
            }
            Clear-ReadOnlyAttribute $entry
            [void]$files.Add($entry)
        }
    }
    foreach ($file in $files) { Write-Output $file }
}

function Test-CanReplace([string] $path) {
    $stream = $null
    try {
        $stream = [System.IO.File]::Open(
            $path,
            [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::ReadWrite,
            [System.IO.FileShare]::None)
        return $true
    } catch {
        return $false
    } finally {
        if ($null -ne $stream) { $stream.Dispose() }
    }
}

function Initialize-MoveFileEx {
    if ('OnlyKeySetup.NativeMethods' -as [type]) { return $true }
    try {
        Add-Type -Namespace OnlyKeySetup -Name NativeMethods -MemberDefinition @"
[DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
public static extern bool MoveFileEx(string lpExistingFileName, string lpNewFileName, int dwFlags);
"@
        return $true
    } catch {
        [Console]::Out.WriteLine('Could not load MoveFileEx.')
        return $false
    }
}

function Register-RebootDelete([string] $path) {
    if (-not $script:scheduleDelete) { return }
    if (-not (Initialize-MoveFileEx)) { return }
    # MOVEFILE_DELAY_UNTIL_REBOOT = 4. Null destination deletes the file.
    $deleted = [OnlyKeySetup.NativeMethods]::MoveFileEx($path, $null, 4)
    if (-not $deleted) {
        [Console]::Out.WriteLine("Could not schedule deletion of $path")
    }
}

function Move-LockedAside([string] $path) {
    $dest = '{0}.pending-delete-{1}' -f $path, ([Guid]::NewGuid().ToString('N'))
    try {
        [System.IO.File]::Move($path, $dest)
    } catch {
        [Console]::Out.WriteLine("Could not move locked file: $path")
        return $false
    }
    [Console]::Out.WriteLine("Moved locked file aside: $path")
    Register-RebootDelete $dest
    return $true
}

function Remove-PendingFiles([string] $rootDir) {
    foreach ($file in @(Get-InstallFiles $rootDir)) {
        if ($file -notmatch '\.pending-delete-[0-9a-fA-F]{32}$') { continue }
        if (-not (Test-CanReplace $file)) {
            Register-RebootDelete $file
            continue
        }
        try { [System.IO.File]::Delete($file) } catch {}
    }
}

function Remove-ReparsePoints([string] $rootDir) {
    $stack = New-Object System.Collections.ArrayList
    [void]$stack.Add($rootDir.TrimEnd('\'))
    while ($stack.Count -gt 0) {
        $current = [string]$stack[$stack.Count - 1]
        $stack.RemoveAt($stack.Count - 1)
        $entries = $null
        try { $entries = [System.IO.Directory]::EnumerateFileSystemEntries($current) } catch { continue }
        foreach ($entry in $entries) {
            $attr = $null
            try { $attr = [System.IO.File]::GetAttributes($entry) } catch { continue }
            $flags = [int]$attr
            $reparse = [int][System.IO.FileAttributes]::ReparsePoint
            $directory = [int][System.IO.FileAttributes]::Directory
            if (($flags -band $reparse) -ne 0) {
                try {
                    if (($flags -band $directory) -ne 0) { [System.IO.Directory]::Delete($entry, $false) }
                    else { [System.IO.File]::Delete($entry) }
                } catch {}
                continue
            }
            if (($flags -band $directory) -ne 0) { [void]$stack.Add($entry) }
        }
    }
}

function Remove-EmptyDirectories([string] $rootDir) {
    $dirs = New-Object System.Collections.Generic.List[string]
    $stack = New-Object System.Collections.ArrayList
    [void]$stack.Add($rootDir.TrimEnd('\'))
    while ($stack.Count -gt 0) {
        $current = [string]$stack[$stack.Count - 1]
        $stack.RemoveAt($stack.Count - 1)
        [void]$dirs.Add($current)
        $entries = $null
        try { $entries = [System.IO.Directory]::EnumerateDirectories($current) } catch { continue }
        foreach ($entry in $entries) {
            $attr = $null
            try { $attr = [System.IO.File]::GetAttributes($entry) } catch { continue }
            $reparse = [int][System.IO.FileAttributes]::ReparsePoint
            if (([int]$attr -band $reparse) -ne 0) { continue }
            [void]$stack.Add($entry)
        }
    }
    foreach ($entry in ($dirs | Sort-Object -Property Length -Descending)) {
        try { [System.IO.Directory]::Delete($entry, $false) } catch {}
    }
}

function Remove-OldInstall([string] $rootDir) {
    foreach ($file in @(Get-InstallFiles $rootDir)) {
        if (-not (Test-CanReplace $file)) { continue }
        try { [System.IO.File]::Delete($file) } catch {}
    }
    Remove-ReparsePoints $rootDir
    Remove-EmptyDirectories $rootDir
}

if ($env:ONLYKEY_REMOVE_PENDING -eq '1') {
    Remove-PendingFiles $info.FullName
    exit 0
}

for ($attempt = 0; $attempt -lt 20; $attempt++) {
    $idsLeft = @(Get-InstallProcessIds | Where-Object { $_ -ne $PID })
    if ($idsLeft.Count -eq 0) { break }
    foreach ($procId in $idsLeft) {
        Write-Output "Closing process $procId"
        & $taskkill /F /PID $procId /T 2>$null | Out-Null
    }
    Start-Sleep -Milliseconds 200
}

$idsLeft = @(Get-InstallProcessIds | Where-Object { $_ -ne $PID })
$processesLeft = $idsLeft.Count -gt 0
if ($processesLeft) {
    Write-Output ("OnlyKey processes still running: " + ($idsLeft -join ', '))
}

$files = @(Get-InstallFiles $info.FullName)
$locked = @($files | Where-Object { -not (Test-CanReplace $_) })
# The kernel can keep a DLL mapped for a moment after nw.exe exits.
# Recheck only the files that were busy so the rest of the tree is left alone.
$deadline = [DateTime]::UtcNow.AddSeconds(4)
while ($locked.Count -gt 0 -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 200
    $locked = @($locked | Where-Object { (Test-Path -LiteralPath $_) -and -not (Test-CanReplace $_) })
}

$stuck = 0
foreach ($path in $locked) {
    if ($path -match '\.pending-delete-[0-9a-fA-F]{32}$') {
        Register-RebootDelete $path
        continue
    }
    if (Test-CanReplace $path) { continue }
    if (-not (Move-LockedAside $path)) { $stuck++ }
}

# Drop every previous file the system will let us remove, including an
# unlocked rename from an earlier setup. A file that is still mapped stays
# under its pending-delete name until the sweep or the next boot.
Remove-OldInstall $info.FullName

if ($stuck -gt 0 -or $processesLeft) { exit 2 }
exit 0
