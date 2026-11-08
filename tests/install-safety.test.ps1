$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\installer\build\ownership.ps1"
. "$PSScriptRoot\..\installer\build\cleanup.ps1"
$script:passed = 0
function Assert-True($Value, [string]$Message) {
    if (-not $Value) { throw $Message }
}
function Assert-Throws([scriptblock]$Body) {
    $threw = $false
    try { & $Body } catch { $threw = $true }
    Assert-True $threw 'Expected a conflict/error; operation was accepted'
}
function Test-Case([string]$Name, [scriptblock]$Body) {
    & $Body
    $script:passed++
    Write-Output "PASS $Name"
}
function New-FixtureStore {
    $data = @{ Uninstall = @{}; Product = @{}; Run = @{}; Approved = @{} }
    return @{
        Data = $data
        Exists = { param($branch) return $data[$branch].Count -gt 0 }.GetNewClosure()
        Read = { param($branch, $name) return $data[$branch][$name] }.GetNewClosure()
        DeleteTree = { param($branch) $data[$branch].Clear() }.GetNewClosure()
        DeleteValue = { param($branch, $name) [void]$data[$branch].Remove($name) }.GetNewClosure()
    }
}
function Set-FixtureRegistration($Store, $Directory) {
    $Store.Data.Uninstall.InstallLocation = $Directory
    $Store.Data.Uninstall.UninstallString = '"' + ([IO.Path]::Combine($Directory, 'uninstall.exe')) + '" --uninstall'
    $Store.Data.Product[''] = $Directory
}

Test-Case 'Startup ownership: preserve Nectar, a different Oryvia path and orphan approval' {
    $store = New-FixtureStore
    $a = "C:\Ứng dụng\Oryvia A ' [x]"
    $b = "C:\Apps\Oryvia B ' [y]"
    $store.Data.Run.Nectar = '"C:\Nectar\nectar.exe"'
    $store.Data.Run.Oryvia = '"' + (Join-Path $b 'oryvia.exe') + '" --hidden'
    $store.Data.Approved.Nectar = 'keep'
    $store.Data.Approved.Oryvia = 'keep'
    Remove-OryviaOwnedStartup $store $a
    Assert-True ($store.Data.Run.Count -eq 2) 'Foreign startup was removed'
    Assert-True ($store.Data.Approved.Count -eq 2) 'Foreign approval was removed'
    $store.Data.Run.Oryvia = '"' + (Join-Path $a 'oryvia.exe') + '" --hidden "argument with spaces"'
    Remove-OryviaOwnedStartup $store $a
    Assert-True (-not $store.Data.Run.ContainsKey('Oryvia')) 'Owned startup remained'
    Assert-True (-not $store.Data.Approved.ContainsKey('Oryvia')) 'Owned approval remained'
    Assert-True ($store.Data.Run.Nectar -and $store.Data.Approved.Nectar) 'Nectar must be preserved'
    $store.Data.Approved.Oryvia = 'orphan'
    Remove-OryviaOwnedStartup $store $a
    Assert-True ($store.Data.Approved.Oryvia -eq 'orphan') 'Orphan approval has no ownership proof'
    $store.Data.Run.Oryvia = Join-Path $a 'oryvia.exe'
    Remove-OryviaOwnedStartup $store $a
    Assert-True (-not $store.Data.Run.Oryvia) 'Exact unquoted autostart path was not recognized'
}

Test-Case 'Registration A cannot be overwritten or removed by B in either scope' {
    foreach ($scopeName in @('user', 'all-users')) {
        $store = New-FixtureStore
        Set-FixtureRegistration $store 'C:\Ứng dụng\Oryvia A'
        Assert-Throws { Assert-OryviaRegistrationWritable $store "C:\Apps\Oryvia B ' [y]" }
        Assert-Throws { Remove-OryviaOwnedRegistration $store "C:\Apps\Oryvia B ' [y]" }
        Assert-True ($store.Data.Uninstall.InstallLocation -eq 'C:\Ứng dụng\Oryvia A') "$scopeName registration was overwritten/deleted"
        $store.Data.Uninstall.InstallLocation = '"c:/Ứng dụng/oryvia a/./"'
        Assert-OryviaRegistrationWritable $store 'C:\Ứng dụng\Oryvia A'
        $store.Data.Uninstall.UninstallString = '"C:\Apps\Oryvia B '' [y]\uninstall.exe" --uninstall'
        Assert-Throws { Remove-OryviaOwnedRegistration $store 'C:\Ứng dụng\Oryvia A' }
        $store.Data.Uninstall.UninstallString = '"C:\Ứng dụng\Oryvia A\oryvia.exe" --uninstall'
        Remove-OryviaOwnedRegistration $store 'C:\Ứng dụng\Oryvia A'
        Assert-True ($store.Data.Uninstall.Count -eq 0) 'Owned registration remained'
    }
}

$fixture = Join-Path $env:TEMP ('oryvia-audit-tests-' + [Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($fixture)
$directory = Join-Path $fixture "Oryvia dùng chung ' & `$() [x]"
[void][IO.Directory]::CreateDirectory($directory)
$log = Join-Path $fixture 'cleanup.log'
try {
    Test-Case 'NSIS pre-write guard rejects unverified legal folders and preserves bytes' {
        $legal = Join-Path $directory 'oryvia-legal'
        [void][IO.Directory]::CreateDirectory($legal)
        [IO.File]::WriteAllText((Join-Path $directory '.install-scope'), 'user')
        $scope = Join-Path $legal '.legal-scope'
        $license = Join-Path $legal 'LICENSE'
        $notice = Join-Path $legal 'NOTICE'
        [IO.File]::WriteAllText($license, [IO.File]::ReadAllText("$PSScriptRoot\..\LICENSE"))
        [IO.File]::WriteAllText($notice, [IO.File]::ReadAllText("$PSScriptRoot\..\NOTICE"))
        $before = [IO.File]::ReadAllBytes($license)
        Assert-Throws { Assert-OryviaInstallDirectory $directory user }
        foreach ($invalid in @('all-users', 'unknown', '')) {
            [IO.File]::WriteAllText($scope, $invalid)
            Assert-Throws { Assert-OryviaInstallDirectory $directory user }
        }
        [IO.File]::Delete($scope)
        [void][IO.Directory]::CreateDirectory($scope)
        Assert-Throws { Assert-OryviaInstallDirectory $directory user }
        [IO.Directory]::Delete($scope)
        [IO.File]::WriteAllText($scope, 'user')
        Assert-OryviaInstallDirectory $directory user
        $lock = [IO.File]::Open($scope, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
        try { Assert-Throws { Assert-OryviaInstallDirectory $directory user } } finally { $lock.Dispose() }
        [IO.File]::WriteAllText((Join-Path $legal 'foreign.txt'), 'keep')
        Assert-Throws { Assert-OryviaInstallDirectory $directory user }
        Assert-True ([IO.File]::ReadAllText((Join-Path $legal 'foreign.txt')) -eq 'keep') 'Foreign content changed'
        [IO.File]::Delete((Join-Path $legal 'foreign.txt'))
        [IO.File]::Delete($notice)
        [void][IO.Directory]::CreateDirectory($notice)
        Assert-Throws { Assert-OryviaInstallDirectory $directory user }
        [IO.Directory]::Delete($notice)
        # Junctions need no symlink privilege; the named managed child must be rejected.
        $junction = New-Item -ItemType Junction -Path $notice -Target $fixture -ErrorAction Stop
        try { Assert-Throws { Assert-OryviaInstallDirectory $directory user } } finally { [IO.Directory]::Delete($notice) }
        Assert-True ([Convert]::ToBase64String([IO.File]::ReadAllBytes($license)) -ceq [Convert]::ToBase64String($before)) 'Guard changed license bytes'
        [IO.File]::Delete($license)
        [IO.File]::Delete($scope)
        [IO.Directory]::Delete($legal)
        [IO.File]::WriteAllText($legal, 'foreign path conflict')
        Assert-Throws { Assert-OryviaInstallDirectory $directory user }
        Assert-True ([IO.File]::ReadAllText($legal) -eq 'foreign path conflict') 'Conflicting file changed'
        [IO.File]::Delete($legal)
        $null = New-Item -ItemType Junction -Path $legal -Target $fixture -ErrorAction Stop
        try { Assert-Throws { Assert-OryviaInstallDirectory $directory user } } finally { [IO.Directory]::Delete($legal) }
        [IO.File]::Delete((Join-Path $directory '.install-scope'))
    }
    Test-Case 'Locked executable preserves marker/registration, then retry completes' {
        $store = New-FixtureStore
        Set-FixtureRegistration $store $directory
        [IO.File]::WriteAllText((Join-Path $directory '.install-scope'), 'user')
        [IO.File]::WriteAllText((Join-Path $directory 'oryvia.exe'), 'fixture')
        [IO.File]::WriteAllText((Join-Path $directory 'uninstall.exe'), 'fixture')
        $legal = Join-Path $directory 'oryvia-legal'
        [IO.Directory]::CreateDirectory($legal) | Out-Null
        [IO.File]::WriteAllText((Join-Path $legal 'LICENSE'), "GNU GENERAL PUBLIC LICENSE`r`nVersion 3, 29 June 2007")
        [IO.File]::WriteAllText((Join-Path $legal 'NOTICE'), "Oryvia - Panchi146`r`nNOTICE")
        [IO.File]::WriteAllText((Join-Path $legal '.legal-scope'), 'user')
        # A root foreign LICENSE must be ignored and preserved
        [IO.File]::WriteAllText((Join-Path $directory 'LICENSE'), "Foreign software GPLv3 LICENSE`r`nGNU GENERAL PUBLIC LICENSE`r`nVersion 3, 29 June 2007")
        [IO.File]::WriteAllText((Join-Path $directory 'foreign.exe'), 'foreign')
        [IO.File]::WriteAllText((Join-Path $directory 'settings.json'), 'keep')
        $finalize = { Remove-OryviaOwnedStartup $store $directory; Remove-OryviaOwnedRegistration $store $directory }
        $lock = [IO.File]::Open((Join-Path $directory 'oryvia.exe'), [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
        try {
            $result = Invoke-OryviaFileCleanup -Directory $directory -ExpectedScope user -Finalize $finalize -Attempts 2 -DelayMilliseconds 10 -LogPath $log
            Assert-True ($result -eq $false) 'Locked cleanup claimed success'
            Assert-True ((Get-Content -LiteralPath (Join-Path $directory '.install-scope') -Raw) -eq 'user') 'Marker was lost while locked'
            Assert-True ($store.Data.Uninstall.Count -gt 0) 'Registration was lost while locked'
            Assert-True (Test-Path -LiteralPath (Join-Path $directory 'uninstall.exe')) 'Registered retry executable was removed while main was locked'
            Assert-True (Test-Path -LiteralPath (Join-Path $legal 'LICENSE')) 'Legal LICENSE was removed while main was locked'
            Assert-True (Test-Path -LiteralPath (Join-Path $legal 'NOTICE')) 'Legal NOTICE was removed while main was locked'
            Assert-True ((Get-Content -LiteralPath $log -Raw).Contains('incomplete')) 'Missing clear pending log'
        } finally { $lock.Dispose() }
        $result = Invoke-OryviaFileCleanup -Directory $directory -ExpectedScope user -Finalize $finalize -Attempts 2 -DelayMilliseconds 10 -LogPath $log
        Assert-True ($result -eq $true) ('Retry did not complete: ' + (Get-Content -LiteralPath $log -Raw))
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $directory '.install-scope'))) 'Marker remained after success'
        Assert-True (-not (Test-Path -LiteralPath $legal)) 'oryvia-legal folder remained after success'
        Assert-True ($store.Data.Uninstall.Count -eq 0) 'Registration remained after success'
        Assert-True ((Get-Content -LiteralPath (Join-Path $directory 'LICENSE') -Raw).Contains('Foreign software')) 'Foreign root LICENSE was corrupted or deleted'
        Assert-True ((Get-Content -LiteralPath (Join-Path $directory 'foreign.exe') -Raw) -eq 'foreign') 'Foreign file was changed'
        Assert-True ((Get-Content -LiteralPath (Join-Path $directory 'settings.json') -Raw) -eq 'keep') 'Settings were changed'
    }
    Test-Case 'Missing, corrupt and wrong-scope marker prevent deletion and finalization' {
        foreach ($scopeText in @($null, 'corrupt', 'all-users')) {
            $marker = Join-Path $directory '.install-scope'
            if (Test-Path -LiteralPath $marker) { Remove-Item -LiteralPath $marker }
            if ($null -ne $scopeText) { [IO.File]::WriteAllText($marker, $scopeText) }
            [IO.File]::WriteAllText((Join-Path $directory 'oryvia.exe'), 'retained')
            $state = @{ Finalized = $false }
            $finalize = { $state.Finalized = $true }.GetNewClosure()
            $result = Invoke-OryviaFileCleanup -Directory $directory -ExpectedScope user -Finalize $finalize -Attempts 1 -LogPath $log
            Assert-True (-not $result -and -not $state.Finalized) 'Invalid marker allowed finalization'
            Assert-True ((Get-Content -LiteralPath (Join-Path $directory 'oryvia.exe') -Raw) -eq 'retained') 'Invalid marker allowed deletion'
        }
    }
    Test-Case 'Native registration entry remains usable when the other executable is locked' {
        $store = New-FixtureStore
        Set-FixtureRegistration $store $directory
        $store.Data.Uninstall.UninstallString = '"' + (Join-Path $directory 'oryvia.exe') + '" --uninstall'
        [IO.File]::WriteAllText((Join-Path $directory '.install-scope'), 'user')
        [IO.File]::WriteAllText((Join-Path $directory 'oryvia.exe'), 'native retry')
        [IO.File]::WriteAllText((Join-Path $directory 'uninstall.exe'), 'locked fixture')
        $beforeDelete = { Assert-OryviaRegistrationWritable $store $directory; 'oryvia.exe' }
        $lock = [IO.File]::Open((Join-Path $directory 'uninstall.exe'), [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
        try {
            $result = Invoke-OryviaFileCleanup -Directory $directory -ExpectedScope user -BeforeDelete $beforeDelete -Attempts 1 -LogPath $log
            Assert-True (-not $result) 'Locked native cleanup claimed success'
            Assert-True (Test-Path -LiteralPath (Join-Path $directory 'oryvia.exe')) 'Native retry executable was removed'
            Assert-True ($store.Data.Uninstall.Count -gt 0) 'Native registration was removed'
        } finally { $lock.Dispose() }
        [IO.File]::Delete((Join-Path $directory 'oryvia.exe'))
        [IO.File]::Delete((Join-Path $directory 'uninstall.exe'))
    }
    Test-Case 'Registration finalization failure retains marker and logs a retry condition' {
        [IO.File]::WriteAllText((Join-Path $directory '.install-scope'), 'user')
        $result = Invoke-OryviaFileCleanup -Directory $directory -ExpectedScope user -Finalize { throw 'fixture registry access denied' } -Attempts 1 -LogPath $log
        Assert-True (-not $result) 'Registry failure claimed success'
        Assert-True (Test-Path -LiteralPath (Join-Path $directory '.install-scope')) 'Marker lost on finalization failure'
        Assert-True ((Get-Content -LiteralPath $log -Raw).Contains('fixture registry access denied')) 'Registry error was not logged'
    }
    Test-Case 'Marker-write recovery removes only owned inconsistent registration' {
        $store = New-FixtureStore
        Set-FixtureRegistration $store $directory
        Repair-OryviaMarkerFailure $store $directory user
        Assert-True ($store.Data.Uninstall.Count -gt 0) 'Valid previous marker registration was removed'
        [IO.File]::Delete((Join-Path $directory '.install-scope'))
        Repair-OryviaMarkerFailure $store $directory user
        Assert-True ($store.Data.Uninstall.Count -eq 0) 'Unmarked new registration remained inconsistent'
        Set-FixtureRegistration $store "C:\Other Oryvia ' [x]"
        Assert-Throws { Repair-OryviaMarkerFailure $store $directory user }
        Assert-True ($store.Data.Uninstall.Count -gt 0) 'Marker recovery removed another path registration'
    }
    Test-Case 'Locked owned LICENSE in oryvia-legal preserves retry executable and marker, then retry succeeds' {
        $store = New-FixtureStore
        Set-FixtureRegistration $store $directory
        [IO.File]::WriteAllText((Join-Path $directory '.install-scope'), 'user')
        [IO.File]::WriteAllText((Join-Path $directory 'oryvia.exe'), 'fixture')
        [IO.File]::WriteAllText((Join-Path $directory 'uninstall.exe'), 'fixture')
        $legal = Join-Path $directory 'oryvia-legal'
        [IO.Directory]::CreateDirectory($legal) | Out-Null
        [IO.File]::WriteAllText((Join-Path $legal 'LICENSE'), "GNU GENERAL PUBLIC LICENSE`r`nVersion 3, 29 June 2007")
        [IO.File]::WriteAllText((Join-Path $legal 'NOTICE'), "Oryvia - Panchi146`r`nNOTICE")
        [IO.File]::WriteAllText((Join-Path $legal '.legal-scope'), 'user')
        $finalize = { Remove-OryviaOwnedStartup $store $directory; Remove-OryviaOwnedRegistration $store $directory }
        $lock = [IO.File]::Open((Join-Path $legal 'LICENSE'), [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
        try {
            $result = Invoke-OryviaFileCleanup -Directory $directory -ExpectedScope user -Finalize $finalize -Attempts 2 -DelayMilliseconds 10 -LogPath $log
            Assert-True ($result -eq $false) 'Locked LICENSE cleanup claimed success'
            Assert-True (Test-Path -LiteralPath (Join-Path $directory 'uninstall.exe')) 'Retry executable was removed while LICENSE was locked'
            Assert-True (Test-Path -LiteralPath (Join-Path $directory '.install-scope')) 'Marker was lost while LICENSE was locked'
            Assert-True ($store.Data.Uninstall.Count -gt 0) 'Registration was deleted while LICENSE was locked'
        } finally { $lock.Dispose() }
        $result = Invoke-OryviaFileCleanup -Directory $directory -ExpectedScope user -Finalize $finalize -Attempts 2 -DelayMilliseconds 10 -LogPath $log
        Assert-True ($result -eq $true) 'Retry after unlocking LICENSE failed'
        Assert-True (-not (Test-Path -LiteralPath $legal)) 'oryvia-legal remained after successful cleanup'
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $directory 'uninstall.exe'))) 'Uninstaller remained after successful cleanup'
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $directory '.install-scope'))) 'Marker remained after successful cleanup'
        Assert-True ($store.Data.Uninstall.Count -eq 0) 'Registration remained after successful cleanup'
    }
    Test-Case 'Foreign LICENSE and NOTICE are preserved and do not block clean uninstall' {
        $store = New-FixtureStore
        Set-FixtureRegistration $store $directory
        [IO.File]::WriteAllText((Join-Path $directory '.install-scope'), 'user')
        [IO.File]::WriteAllText((Join-Path $directory 'oryvia.exe'), 'fixture')
        [IO.File]::WriteAllText((Join-Path $directory 'uninstall.exe'), 'fixture')
        [IO.File]::WriteAllText((Join-Path $directory 'LICENSE'), 'MIT License Copyright (c) 2024 Someone Else')
        [IO.File]::WriteAllText((Join-Path $directory 'NOTICE'), 'Foreign notice belonging to another tool')
        $finalize = { Remove-OryviaOwnedStartup $store $directory; Remove-OryviaOwnedRegistration $store $directory }
        $result = Invoke-OryviaFileCleanup -Directory $directory -ExpectedScope user -Finalize $finalize -Attempts 2 -DelayMilliseconds 10 -LogPath $log
        Assert-True ($result -eq $true) 'Uninstall failed when foreign documents were present'
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $directory 'oryvia.exe'))) 'oryvia.exe remained'
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $directory 'uninstall.exe'))) 'uninstall.exe remained'
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $directory '.install-scope'))) 'Marker remained'
        Assert-True ($store.Data.Uninstall.Count -eq 0) 'Registration remained'
        Assert-True ((Get-Content -LiteralPath (Join-Path $directory 'LICENSE') -Raw) -eq 'MIT License Copyright (c) 2024 Someone Else') 'Foreign LICENSE was corrupted or deleted'
        Assert-True ((Get-Content -LiteralPath (Join-Path $directory 'NOTICE') -Raw) -eq 'Foreign notice belonging to another tool') 'Foreign NOTICE was corrupted or deleted'
        [IO.File]::Delete((Join-Path $directory 'LICENSE'))
        [IO.File]::Delete((Join-Path $directory 'NOTICE'))
    }
    Test-Case 'Unverified pre-existing oryvia-legal folder is not claimed or deleted' {
        $store = New-FixtureStore
        Set-FixtureRegistration $store $directory
        [IO.File]::WriteAllText((Join-Path $directory '.install-scope'), 'user')
        [IO.File]::WriteAllText((Join-Path $directory 'oryvia.exe'), 'fixture')
        [IO.File]::WriteAllText((Join-Path $directory 'uninstall.exe'), 'fixture')
        $legal = Join-Path $directory 'oryvia-legal'
        [IO.Directory]::CreateDirectory($legal) | Out-Null
        [IO.File]::WriteAllText((Join-Path $legal 'foreign.txt'), 'do not touch')
        $finalize = { Remove-OryviaOwnedStartup $store $directory; Remove-OryviaOwnedRegistration $store $directory }
        $result = Invoke-OryviaFileCleanup -Directory $directory -ExpectedScope user -Finalize $finalize -Attempts 2 -DelayMilliseconds 10 -LogPath $log
        Assert-True ($result -eq $true) 'Uninstall failed when unverified legal folder was present'
        Assert-True (Test-Path -LiteralPath $legal) 'Unverified oryvia-legal was deleted'
        Assert-True (Test-Path -LiteralPath (Join-Path $legal 'foreign.txt')) 'Foreign file in legal folder was deleted'
        [IO.File]::Delete((Join-Path $legal 'foreign.txt'))
        [IO.Directory]::Delete($legal)
    }
} finally {
    # Only exact files created by this fixture, then empty directories; never recurse.
    $legal = Join-Path $directory 'oryvia-legal'
    if (Test-Path -LiteralPath $legal) {
        foreach ($name in @('LICENSE', 'NOTICE', '.legal-scope', 'foreign.txt')) {
            $f = Join-Path $legal $name
            if (Test-Path -LiteralPath $f) { [IO.File]::Delete($f) }
        }
        [IO.Directory]::Delete($legal)
    }
    foreach ($name in @('.install-scope', 'oryvia.exe', 'uninstall.exe', 'LICENSE', 'NOTICE', 'foreign.exe', 'settings.json')) {
        $file = Join-Path $directory $name
        if (Test-Path -LiteralPath $file) { [IO.File]::Delete($file) }
    }
    if (Test-Path -LiteralPath $log) { [IO.File]::Delete($log) }
    [IO.Directory]::Delete($directory)
    [IO.Directory]::Delete($fixture)
}
Write-Output "RESULT: $script:passed behavior tests passed; no live registry access performed."
