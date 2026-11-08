param(
    [ValidateSet('', 'Check', 'MarkerFailureCleanup')][string]$Action = '',
    [string]$InstallDir,
    [ValidateSet('user', 'all-users')][string]$Scope = 'user'
)

# Shared by Custom Installer, native/heal, delayed cleanup and NSIS.
# Store operations are injected in tests; production opens only the current
# account's HKCU or the selected HKLM scope, always in the 64-bit view.
function Get-OryviaNormalizedPath([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
    $value = $Value.Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"')) { $value = $value.Substring(1, $value.Length - 2) }
    if ($value.Contains('"') -or $value.Contains([char]0)) { return $null }
    $value = $value.Replace('/', '\')
    if ($value.StartsWith('\\?\UNC\', [StringComparison]::OrdinalIgnoreCase)) { $value = '\\' + $value.Substring(8) }
    elseif ($value.StartsWith('\\?\')) { $value = $value.Substring(4) }
    if ($value -notmatch '^(?:[A-Za-z]:\\|\\\\[^\\]+\\[^\\]+)') { return $null }
    try { return [IO.Path]::GetFullPath($value).TrimEnd('\').ToUpperInvariant() } catch { return $null }
}

function Test-OryviaCommandTarget([string]$Command, [string]$Directory, [string[]]$Names) {
    if ([string]::IsNullOrWhiteSpace($Command)) { return $false }
    $command = $Command.Trim()
    foreach ($name in $Names) {
        $expected = Get-OryviaNormalizedPath (Join-Path $Directory $name)
        if (-not $expected) { continue }
        # auto-launch 0.5.0 writes the raw full path with no args in this app.
        if ((Get-OryviaNormalizedPath $command) -ceq $expected) { return $true }
        if ($command -match '^"([^"\r\n]+)"(?:\s|$)') { $exe = $Matches[1] }
        elseif ($command -match '^([^\s"]+)(?:\s|$)') { $exe = $Matches[1] }
        else { continue }
        if ((Get-OryviaNormalizedPath $exe) -ceq $expected) { return $true }
    }
    return $false
}

function New-OryviaRegistryStore([bool]$AllUsers) {
    $locations = @{
        Uninstall = @($(if ($AllUsers) { 'LocalMachine' } else { 'CurrentUser' }), 'Software\Microsoft\Windows\CurrentVersion\Uninstall\Oryvia')
        Product = @($(if ($AllUsers) { 'LocalMachine' } else { 'CurrentUser' }), 'Software\panchi146\Oryvia')
        Run = @('CurrentUser', 'Software\Microsoft\Windows\CurrentVersion\Run')
        Approved = @('CurrentUser', 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run')
    }
    return @{
        Exists = { param($branch)
            $loc = $locations[$branch]
            $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::$($loc[0]), [Microsoft.Win32.RegistryView]::Registry64)
            try { $key = $base.OpenSubKey($loc[1]); try { return $null -ne $key } finally { if ($key) { $key.Dispose() } } } finally { $base.Dispose() }
        }.GetNewClosure()
        Read = { param($branch, $name)
            $loc = $locations[$branch]
            $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::$($loc[0]), [Microsoft.Win32.RegistryView]::Registry64)
            try {
                $key = $base.OpenSubKey($loc[1])
                try {
                    if (-not $key) { return $null }
                    $value = $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
                    if ($null -ne $value -and $value -isnot [string]) { throw 'Unexpected registry value type' }
                    return $value
                } finally { if ($key) { $key.Dispose() } }
            } finally { $base.Dispose() }
        }.GetNewClosure()
        DeleteTree = { param($branch)
            $loc = $locations[$branch]
            $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::$($loc[0]), [Microsoft.Win32.RegistryView]::Registry64)
            try { $base.DeleteSubKeyTree($loc[1], $false) } finally { $base.Dispose() }
        }.GetNewClosure()
        DeleteValue = { param($branch, $name)
            $loc = $locations[$branch]
            $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::$($loc[0]), [Microsoft.Win32.RegistryView]::Registry64)
            try { $key = $base.OpenSubKey($loc[1], $true); try { if ($key) { $key.DeleteValue($name, $false) } } finally { if ($key) { $key.Dispose() } } } finally { $base.Dispose() }
        }.GetNewClosure()
    }
}

function Test-OryviaRegistrationOwned($Store, [string]$Directory) {
    if (-not (& $Store.Exists 'Uninstall')) { return $false }
    $location = & $Store.Read 'Uninstall' 'InstallLocation'
    $uninstall = & $Store.Read 'Uninstall' 'UninstallString'
    $expected = Get-OryviaNormalizedPath $Directory
    return $expected -and ((Get-OryviaNormalizedPath $location) -ceq $expected) -and
        (Test-OryviaCommandTarget $uninstall $Directory @('oryvia.exe', 'uninstall.exe'))
}

function Assert-OryviaRegistrationWritable($Store, [string]$Directory) {
    if (-not (Get-OryviaNormalizedPath $Directory)) { throw 'Invalid absolute Windows install path' }
    if ((& $Store.Exists 'Uninstall') -and -not (Test-OryviaRegistrationOwned $Store $Directory)) {
        throw 'registration_conflict: Oryvia is registered at a different or unverified path in this scope. Uninstall that copy first; its registration was preserved.'
    }
    $product = & $Store.Read 'Product' ''
    if ($null -ne $product -and (Get-OryviaNormalizedPath $product) -cne (Get-OryviaNormalizedPath $Directory)) {
        throw 'registration_conflict: The Oryvia install-location key belongs to another path; it was preserved.'
    }
}

function Remove-OryviaOwnedStartup($Store, [string]$Directory, [string]$StartupName = 'Oryvia') {
    $run = & $Store.Read 'Run' $StartupName
    if (-not (Test-OryviaCommandTarget $run $Directory @('oryvia.exe'))) { return }
    # Recheck before mutation. A missing Run value is not proof for StartupApproved.
    if ((& $Store.Read 'Run' $StartupName) -cne $run) { throw 'Startup registration changed during cleanup' }
    & $Store.DeleteValue 'Run' $StartupName
    & $Store.DeleteValue 'Approved' $StartupName
}

function Remove-OryviaOwnedRegistration($Store, [string]$Directory) {
    Assert-OryviaRegistrationWritable $Store $Directory
    if (Test-OryviaRegistrationOwned $Store $Directory) { & $Store.DeleteTree 'Uninstall' }
    $product = & $Store.Read 'Product' ''
    if ($null -ne $product -and (Get-OryviaNormalizedPath $product) -ceq (Get-OryviaNormalizedPath $Directory)) { & $Store.DeleteTree 'Product' }
}

function Repair-OryviaMarkerFailure($Store, [string]$Directory, [string]$ExpectedScope) {
    $marker = Join-Path $Directory '.install-scope'
    $valid = (Test-Path -LiteralPath $marker -PathType Leaf) -and ((Get-Content -LiteralPath $marker -Raw).Trim() -ceq $ExpectedScope)
    if (-not $valid) { Remove-OryviaOwnedRegistration $Store $Directory }
}

function Get-OryviaOptionalItem([string]$Path) {
    try { Get-Item -LiteralPath $Path -Force -ErrorAction Stop }
    catch [System.Management.Automation.ItemNotFoundException] { return $null }
}

# Shared pre-write guard, invoked by Check and isolated tests.
function Assert-OryviaInstallDirectory([string]$Directory, [string]$ExpectedScope) {
    $current = $Directory
    while ($current) {
        $item = Get-OryviaOptionalItem $current
        if ($item -and (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint))) { throw 'Install path is not a plain directory.' }
        $parent = [IO.Directory]::GetParent($current)
        if (-not $parent) { break }
        $current = $parent.FullName
    }
    $marker = Join-Path $Directory '.install-scope'
    $markerItem = Get-OryviaOptionalItem $marker
    if ($markerItem) {
        if ($markerItem.PSIsContainer -or ($markerItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
            ([IO.File]::ReadAllText($marker).Trim() -cne $ExpectedScope)) { throw 'Invalid install scope marker.' }
    } elseif ((Test-Path -LiteralPath (Join-Path $Directory 'oryvia.exe')) -or
              (Test-Path -LiteralPath (Join-Path $Directory 'uninstall.exe')) -or
              (Test-Path -LiteralPath (Join-Path $Directory 'oryvia-legal'))) { throw 'Existing installation has no valid scope marker.' }
    $legal = Join-Path $Directory 'oryvia-legal'
    $legalItem = Get-OryviaOptionalItem $legal
    if ($legalItem) {
        if (-not $legalItem.PSIsContainer -or ($legalItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Legal path is not a plain directory.' }
        $scope = Join-Path $legal '.legal-scope'
        $scopeItem = Get-Item -LiteralPath $scope -Force -ErrorAction Stop
        if ($scopeItem.PSIsContainer -or ($scopeItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
            ([IO.File]::ReadAllText($scope).Trim() -cne $ExpectedScope)) { throw 'Legal scope marker is invalid.' }
        foreach ($item in @(Get-ChildItem -LiteralPath $legal -Force -ErrorAction Stop)) {
            if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
                $item.Name -notin @('LICENSE', 'NOTICE', '.legal-scope')) { throw 'Unverified legal directory child.' }
            $text = [IO.File]::ReadAllText($item.FullName)
            if ($item.Name -eq 'LICENSE' -and (-not $text.Contains('GNU GENERAL PUBLIC LICENSE') -or -not $text.Contains('Version 3, 29 June 2007'))) { throw 'Unverified license.' }
            if ($item.Name -eq 'NOTICE' -and (-not $text.Contains(('Oryvia ' + [char]0x2014 + ' modified version of Nectar and Bloom')) -or -not $text.Contains('Panchi146'))) { throw 'Unverified notice.' }
        }
    }
    foreach ($name in @('oryvia.exe', 'uninstall.exe', '.install-scope')) {
        $item = Get-OryviaOptionalItem (Join-Path $Directory $name)
        if ($item -and ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint))) { throw 'Application file is not a plain file.' }
    }
}

if ($Action) {
    $ErrorActionPreference = 'Stop'
    try {
        $store = New-OryviaRegistryStore ($Scope -eq 'all-users')
        if ($Action -eq 'Check') {
            Assert-OryviaRegistrationWritable $store $InstallDir
            Assert-OryviaInstallDirectory $InstallDir $Scope
        } elseif ($Action -eq 'MarkerFailureCleanup') {
            Repair-OryviaMarkerFailure $store $InstallDir $Scope
        }
    } catch { Write-Output $_.Exception.Message; exit 1 }
}
