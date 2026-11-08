param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\build-output'),
    [string]$BaselineManifest
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\', '/')
$rootPrefix = $root + [IO.Path]::DirectorySeparatorChar

$outDir = [IO.Path]::GetFullPath($OutputDirectory).TrimEnd('\', '/')
$outPrefix = $outDir + [IO.Path]::DirectorySeparatorChar

if ($outDir.Equals($root, [System.StringComparison]::OrdinalIgnoreCase) -or
    $root.StartsWith($outPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Output directory cannot be the project root or an ancestor directory of the project root: $OutputDirectory"
}

$excludedDirectories = @('.git', 'node_modules', 'target', 'dist', 'dist-ssr', 'gen', 'release', 'release-preview', 'release-review', 'release-candidate', 'build-output', 'payload', '.idea', 'logs')
$docsChatDir = [System.IO.Path]::GetFullPath((Join-Path $root 'docs/chat')).TrimEnd('\', '/')
$docsChatPrefix = $docsChatDir + [System.IO.Path]::DirectorySeparatorChar
function Get-SourceFiles([string]$Directory) {
    foreach ($item in Get-ChildItem -LiteralPath $Directory -Force) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
        $itemFull = [IO.Path]::GetFullPath($item.FullName).TrimEnd('\', '/')
        if ($itemFull.Equals($outDir, [System.StringComparison]::OrdinalIgnoreCase) -or
            $itemFull.StartsWith($outPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            continue
        }
        if ($itemFull.Equals($docsChatDir, [System.StringComparison]::OrdinalIgnoreCase) -or
            $itemFull.StartsWith($docsChatPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            continue
        }
        if ($item.PSIsContainer) {
            if ($item.Name -notin $excludedDirectories) { Get-SourceFiles $item.FullName }
            continue
        }
        if ($item.Name -match '(?i)\.(zip|exe|msi|pdb|sig|key|pem|pfx|p12|log|local)$|\.key\.pub$|^\.env|^payload|credentials|secrets') { continue }
        $item
    }
}
function Relative-Name($File) { $File.FullName.Substring($root.Length + 1).Replace('\', '/') }
$files = @(Get-SourceFiles $root | Sort-Object FullName)
if ($BaselineManifest) {
    $before = Get-Content -LiteralPath $BaselineManifest -Raw | ConvertFrom-Json
    $protected = @()
    $changed = @()
    foreach ($file in $files) {
        $name = Relative-Name $file
        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $old = $before.PSObject.Properties[$name]
        if (-not $old -or $old.Value -cne $hash) { $changed += $name }
        if ($name -match '^(src/|src-tauri/|public/|branding/|installer/assets/|installer-app/src/|installer-app/public/|installer-app/src-tauri/icons/)' -or
            $name -in @('LICENSE', 'NOTICE', 'installer-app/src-tauri/tauri.conf.json', 'installer/build/cleanup.ps1', 'installer/build/ownership.ps1', 'install_safety.rs')) {
            if (-not $old -or $old.Value -cne $hash) { throw "Protected source changed: $name" }
            $protected += @{ path = $name; sha256 = $hash }
        }
    }
    @{ baseline = [IO.Path]::GetFileName($BaselineManifest); changedBeforeGeneratedInventory = $changed; protectedIdentical = $protected } |
        ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $root 'migration/custom-uninstall-retry-review.json') -Encoding UTF8
}
$files = @(Get-SourceFiles $root | Sort-Object FullName)
$manifestLines = foreach ($file in $files) {
    $name = Relative-Name $file
    if ($name -eq 'SOURCE_MANIFEST.sha256') { continue }
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $name"
}
[IO.File]::WriteAllLines((Join-Path $root 'SOURCE_MANIFEST.sha256'), [string[]]$manifestLines, [Text.UTF8Encoding]::new($false))
$name = 'Oryvia-Custom-Uninstall-Retry-Fix-Audit'
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
$out = Join-Path $outDir ($name + '.zip')
if (Test-Path -LiteralPath $out) { $out = Join-Path $outDir ($name + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss-ffff') + '.zip') }
# CreateNew makes overwrite impossible even if another process creates it now.
$stream = [IO.File]::Open($out, [IO.FileMode]::CreateNew)
$zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
$expected = @{}
try {
    foreach ($file in $files) {
        $rel = Relative-Name $file
        if ($rel -match '(?i)(?:^|/)(?:\.env|credentials|secrets)(?:[./]|$)') { throw "Forbidden entry: $rel" }
        if ($file.Extension -in @('.rs', '.ts', '.tsx', '.json', '.ps1', '.md', '.yml', '.toml')) {
            if ([IO.File]::ReadAllText($file.FullName) -match '-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----') { throw "Private key material rejected: $rel" }
        }
        $expected[$rel] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $rel)
    }
} finally { $zip.Dispose(); $stream.Dispose() }
$zip = [IO.Compression.ZipFile]::OpenRead($out)
try {
    if ($zip.Entries.Count -ne $expected.Count) { throw 'ZIP entry count mismatch' }
    $seen = @{}
    foreach ($entry in $zip.Entries) {
        if ($seen.ContainsKey($entry.FullName) -or -not $expected.ContainsKey($entry.FullName)) { throw 'Duplicate or unexpected ZIP entry' }
        $seen[$entry.FullName] = $true
        $input = $entry.Open()
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $hash = [BitConverter]::ToString($sha.ComputeHash($input)).Replace('-', '').ToLowerInvariant() }
        finally { $input.Dispose(); $sha.Dispose() }
        if ($hash -cne $expected[$entry.FullName]) { throw "ZIP content mismatch: $($entry.FullName)" }
    }
    foreach ($line in $manifestLines) {
        $entryName = $line.Substring(66)
        if ($expected[$entryName] -cne $line.Substring(0,64)) { throw "Manifest mismatch: $entryName" }
    }
} finally { $zip.Dispose() }
$zipHash = (Get-FileHash -LiteralPath $out -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($out + '.sha256', "$zipHash  $([IO.Path]::GetFileName($out))`n")
$report = @{
    package = [IO.Path]::GetFileName($out); sha256 = $zipHash; entries = $expected.Count
    entryHashesVerified = $expected.Count; manifestEntriesVerified = $manifestLines.Count
    manifestPolicy = 'All packaged files except SOURCE_MANIFEST.sha256 itself; historical manifests remain historical.'
    excludedDirectories = $excludedDirectories; result = 'PASS'; files = $expected
    runtimeLimit = 'Source/fixture validation only; installed-app, Explorer, UAC and alternate-admin E2E pending.'
}
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath ($out + '.verification.json') -Encoding UTF8
Write-Output "PASS: $out"
Write-Output "SHA256: $zipHash"
Write-Output "Verified $($expected.Count) ZIP entries and $($manifestLines.Count) manifest entries."
