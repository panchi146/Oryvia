# Oryvia Release & Review Packaging Script
# Compatible with Windows PowerShell 5.1 and PowerShell 7+
param(
    [string]$Version = "1.0.0",
    [string]$Repository = "panchi146/Oryvia",
    [string]$OutputDirectory,
    [string]$PrivateKeyPath = "C:\Users\phamv\.tauri\oryvia-updater.key",
    [switch]$DryRun,
    [switch]$Prerelease,
    [string]$NotesFile
)

$ErrorActionPreference = "Stop"

function Invoke-Step([string]$label, [scriptblock]$body) {
    Write-Host "`n==> $label" -ForegroundColor Cyan
    $ErrorActionPreference = "Continue"
    & $body
    $code = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($code -ne 0) { throw "$label failed (exit code $code)" }
}

# Snapshot existing environment variables to preserve caller context
$prevSigningKey = [Environment]::GetEnvironmentVariable("TAURI_SIGNING_PRIVATE_KEY", "Process")
$prevSigningKeyPath = [Environment]::GetEnvironmentVariable("TAURI_SIGNING_PRIVATE_KEY_PATH", "Process")
$prevSigningKeyPassword = [Environment]::GetEnvironmentVariable("TAURI_SIGNING_PRIVATE_KEY_PASSWORD", "Process")

$bstr = [IntPtr]::Zero
$plainPass = $null

try {
    if ($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' -or $Repository -ieq 'kua8/Nectar') {
        throw "An Oryvia release repository is required."
    }
    $repo = $Repository
    $tag = "v$Version"
    $root = Resolve-Path "$PSScriptRoot/.."
    $rootPath = [System.IO.Path]::GetFullPath($root.Path).TrimEnd('\', '/')
    Set-Location $rootPath

    if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Version must look like 1.0.0" }
    
    # Read tauri.conf.json with explicit UTF-8 encoding for PowerShell 5.1 compatibility
    $tauriConfRaw = [System.IO.File]::ReadAllText((Join-Path $rootPath "src-tauri/tauri.conf.json"), [System.Text.Encoding]::UTF8)
    $updateConfig = ($tauriConfRaw | ConvertFrom-Json).plugins.updater
    if (-not $updateConfig.pubkey -or -not $updateConfig.endpoints -or ($updateConfig.endpoints | Where-Object { $_ -notlike 'https://*' -or $_ -match '(?i)kua8/Nectar' })) {
        throw "Configure Oryvia updater endpoint and public key before release builds."
    }

    # Pass private key path via TAURI_SIGNING_PRIVATE_KEY (required by Tauri CLI 2.11.4)
    # and also set TAURI_SIGNING_PRIVATE_KEY_PATH for compatibility.
    if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
        if (Test-Path -LiteralPath $PrivateKeyPath) {
            $env:TAURI_SIGNING_PRIVATE_KEY = $PrivateKeyPath
            $env:TAURI_SIGNING_PRIVATE_KEY_PATH = $PrivateKeyPath
        } else {
            throw "Private key file not found at: $PrivateKeyPath"
        }
    }

    # Prompt for password via Read-Host -AsSecureString in user console if not preset
    if (-not $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
        Write-Host "Enter password for Tauri updater private key ($PrivateKeyPath):" -ForegroundColor Yellow
        $secPass = Read-Host -AsSecureString
        if ($secPass) {
            $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secPass)
            $plainPass = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
            $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $plainPass
        }
    }

    if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
        throw "TAURI_SIGNING_PRIVATE_KEY is not set; the update cannot be signed."
    }

    $packageJsonRaw = [System.IO.File]::ReadAllText((Join-Path $rootPath "package.json"), [System.Text.Encoding]::UTF8)
    $srcCargoRaw = [System.IO.File]::ReadAllText((Join-Path $rootPath "src-tauri/Cargo.toml"), [System.Text.Encoding]::UTF8)
    $instPackageRaw = [System.IO.File]::ReadAllText((Join-Path $rootPath "installer-app/package.json"), [System.Text.Encoding]::UTF8)
    $instTauriRaw = [System.IO.File]::ReadAllText((Join-Path $rootPath "installer-app/src-tauri/tauri.conf.json"), [System.Text.Encoding]::UTF8)
    $instCargoRaw = [System.IO.File]::ReadAllText((Join-Path $rootPath "installer-app/src-tauri/Cargo.toml"), [System.Text.Encoding]::UTF8)

    $versionFiles = @{
        "package.json"                            = ($packageJsonRaw | ConvertFrom-Json).version
        "src-tauri/tauri.conf.json"               = ($tauriConfRaw | ConvertFrom-Json).version
        "src-tauri/Cargo.toml"                    = [regex]::Match($srcCargoRaw, '(?m)^version = "([^"]*)"').Groups[1].Value
        "installer-app/package.json"              = ($instPackageRaw | ConvertFrom-Json).version
        "installer-app/src-tauri/tauri.conf.json" = ($instTauriRaw | ConvertFrom-Json).version
        "installer-app/src-tauri/Cargo.toml"      = [regex]::Match($instCargoRaw, '(?m)^version = "([^"]*)"').Groups[1].Value
    }
    $mismatched = $versionFiles.GetEnumerator() | Where-Object { $_.Value -ne $Version }
    if ($mismatched) {
        $mismatched | ForEach-Object { Write-Host "  $($_.Key) is $($_.Value)" -ForegroundColor Yellow }
        throw "Version files don't match $Version."
    }

    if ($OutputDirectory) {
        $out = $OutputDirectory
    } else {
        $timestamp = (Get-Date).ToString("yyyy-MM-dd_HHmmss")
        $out = Join-Path $rootPath "release-review/$timestamp"
    }

    $outFullPath = [System.IO.Path]::GetFullPath($out).TrimEnd('\', '/')
    $outPrefix = $outFullPath + [System.IO.Path]::DirectorySeparatorChar

    if ($outFullPath.Equals($rootPath, [System.StringComparison]::OrdinalIgnoreCase) -or
        $rootPath.StartsWith($outPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Output directory cannot be the project root or an ancestor directory of the project root: $out"
    }

    if (Test-Path -LiteralPath $outFullPath) { throw "Release output already exists ($outFullPath). Choose a new output directory; existing artifacts are preserved." }
    New-Item -ItemType Directory -Path $outFullPath -Force | Out-Null
    $out = $outFullPath

    if ($NotesFile -and (Test-Path -LiteralPath $NotesFile)) {
        $notes = [System.IO.File]::ReadAllText($NotesFile, [System.Text.Encoding]::UTF8)
    } else {
        $notes = "Oryvia $Version release build with signed Tauri v2 updater"
        if (Test-Path (Join-Path $rootPath ".git")) {
            $gitNotes = (git log -1 --pretty=format:"%b" --no-merges 2>$null | Out-String).Trim()
            if (-not $gitNotes) { $gitNotes = (git log -1 --pretty=format:"%s" --no-merges 2>$null | Out-String).Trim() }
            if ($gitNotes) {
                $notes = $gitNotes -replace "(?m)^(What's New|Improvements|Changed|Bug Fixes|Other):?\s*$", '### $1'
            }
        }
    }
    Write-Host "`nRelease notes:`n$notes`n"

    Invoke-Step "Installing frontend dependencies" { bun install }
    Invoke-Step "Building Oryvia (NSIS update installer with signature)" { bun run tauri build --bundles nsis }

    $exe = Join-Path $rootPath "src-tauri/target/release/oryvia.exe"
    $setup = Join-Path $rootPath "src-tauri/target/release/bundle/nsis/Oryvia_${Version}_x64-setup.exe"
    foreach ($f in @($exe, $setup, "$setup.sig")) {
        if (-not (Test-Path $f)) { throw "Expected build output not found: $f" }
    }

    Write-Host "`n==> Packaging portable build" -ForegroundColor Cyan
    $portable = "oryvia-$Version-portable-windows-x64.zip"
    Compress-Archive -Path @($exe, (Join-Path $rootPath "LICENSE"), (Join-Path $rootPath "NOTICE")) -DestinationPath (Join-Path $out $portable)

    Write-Host "`n==> Packaging installer payload" -ForegroundColor Cyan
    $payload = Join-Path $rootPath "installer-app/src-tauri/payload.zip"
    if (Test-Path $payload) { Remove-Item $payload -Force }
    Compress-Archive -Path $exe -DestinationPath $payload -Force

    Push-Location installer-app
    try {
        Invoke-Step "Building custom installer" { bun run tauri build --no-bundle }
    } finally {
        Pop-Location
    }
    $installerName = "Oryvia-Setup-$Version.exe"
    Copy-Item (Join-Path $rootPath "installer-app/src-tauri/target/release/oryvia-installer.exe") (Join-Path $out $installerName)

    Copy-Item $setup $out
    Copy-Item "$setup.sig" $out
    $setupName = Split-Path $setup -Leaf
    $platform = [ordered]@{
        signature = ([System.IO.File]::ReadAllText("$setup.sig", [System.Text.Encoding]::UTF8)).Trim()
        url       = "https://github.com/$repo/releases/download/$tag/$setupName"
    }
    $manifest = [ordered]@{
        version   = $Version
        notes     = $notes
        pub_date  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        platforms = [ordered]@{
            "windows-x86_64"      = $platform
            "windows-x86_64-nsis" = $platform
        }
    }
    [System.IO.File]::WriteAllText((Join-Path $out "latest.json"), ($manifest | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText((Join-Path $out "notes.md"), $notes, [System.Text.UTF8Encoding]::new($false))

    Write-Host "`n==> Packaging Corresponding Source archive" -ForegroundColor Cyan
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $sourceZipPath = Join-Path $out "oryvia-$Version-source.zip"
    $outFullPath = [System.IO.Path]::GetFullPath($out).TrimEnd('\', '/')
    $outPrefix = $outFullPath + [System.IO.Path]::DirectorySeparatorChar
    $docsChatFullPath = [System.IO.Path]::GetFullPath((Join-Path $rootPath 'docs/chat')).TrimEnd('\', '/')
    $docsChatPrefix = $docsChatFullPath + [System.IO.Path]::DirectorySeparatorChar
    $excludedDirs = @('.git', 'node_modules', 'target', 'dist', 'dist-ssr', 'gen', 'release', 'release-preview', 'release-review', 'release-candidate', 'build-output', 'payload', '.idea', 'logs')
    function Get-SourceFiles([string]$dir) {
        foreach ($item in Get-ChildItem -LiteralPath $dir -Force) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
            $itemFull = [System.IO.Path]::GetFullPath($item.FullName).TrimEnd('\', '/')
            if ($itemFull.Equals($outFullPath, [System.StringComparison]::OrdinalIgnoreCase) -or
                $itemFull.StartsWith($outPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                continue
            }
            if ($itemFull.Equals($docsChatFullPath, [System.StringComparison]::OrdinalIgnoreCase) -or
                $itemFull.StartsWith($docsChatPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                continue
            }
            if ($item.PSIsContainer) {
                if ($item.Name -notin $excludedDirs) { Get-SourceFiles $item.FullName }
                continue
            }
            if ($item.Name -match '(?i)\.(zip|exe|msi|pdb|sig|key|pem|pfx|p12|log|local)$|\.key\.pub$|^\.env|^payload|credentials|secrets') { continue }
            $item
        }
    }
    $sourceFiles = @(Get-SourceFiles $rootPath | Sort-Object FullName)
    $rootPrefix = $rootPath + [System.IO.Path]::DirectorySeparatorChar
    $stream = [System.IO.File]::Open($sourceZipPath, [System.IO.FileMode]::CreateNew)
    $zip = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($sf in $sourceFiles) {
            if (-not $sf.FullName.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "File outside project root: $($sf.FullName)"
            }
            $rel = $sf.FullName.Substring($rootPrefix.Length).Replace('\', '/')
            if ($rel -match '^[/\\]' -or $rel -match '^[a-zA-Z]:' -or $rel -match '(^|/)\.\.(/|$)') {
                throw "Invalid zip entry path: $rel"
            }
            if ($rel -match '(?i)(?:^|/)(?:\.env|credentials|secrets)(?:[./]|$)') { throw "Forbidden entry: $rel" }
            if ($sf.Extension -in @('.rs', '.ts', '.tsx', '.json', '.ps1', '.md', '.yml', '.toml', '.html', '.css', '.mjs')) {
                if ([System.IO.File]::ReadAllText($sf.FullName) -match '-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----') {
                    throw "Private key detected: $rel"
                }
            }
            [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $sf.FullName, $rel)
        }
    } finally {
        $zip.Dispose()
        $stream.Dispose()
    }
    Write-Host "Packaged $($sourceFiles.Count) files into $(Split-Path $sourceZipPath -Leaf)"

    # Rigorous signature verification: must pass or halt immediately
    Invoke-Step "Verifying NSIS updater signature" {
        node (Join-Path $rootPath "scripts/verify-signature.mjs") (Join-Path $out $setupName) (Join-Path $out "$setupName.sig")
    }

    Write-Host "`n==> Generating checksums and manifest" -ForegroundColor Cyan
    $checksumFiles = Get-ChildItem -LiteralPath $out -File | Where-Object { $_.Name -ne 'SHA256SUMS.txt' }
    $checksumLines = $checksumFiles | Sort-Object Name | ForEach-Object { "{0}  {1}" -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(), $_.Name }
    [System.IO.File]::WriteAllLines((Join-Path $out 'SHA256SUMS.txt'), [string[]]$checksumLines, [System.Text.UTF8Encoding]::new($false))

    $assets = @("latest.json", $setupName, "$setupName.sig", $portable, $installerName, "oryvia-$Version-source.zip", "SHA256SUMS.txt") | ForEach-Object { Join-Path $out $_ }
    Write-Host "`nBuilt Artifacts in ${out}:" -ForegroundColor Green
    $assets | ForEach-Object {
        if (Test-Path $_) {
            Write-Host ("  {0}  ({1:N2} MB)" -f (Split-Path $_ -Leaf), ((Get-Item $_).Length / 1MB))
        }
    }

    Write-Host "`nLocal artifacts prepared and verified. This script never pushes or creates a GitHub Release." -ForegroundColor Yellow
}
finally {
    # Restore prior environment variables precisely
    [Environment]::SetEnvironmentVariable("TAURI_SIGNING_PRIVATE_KEY", $prevSigningKey, "Process")
    [Environment]::SetEnvironmentVariable("TAURI_SIGNING_PRIVATE_KEY_PATH", $prevSigningKeyPath, "Process")
    [Environment]::SetEnvironmentVariable("TAURI_SIGNING_PRIVATE_KEY_PASSWORD", $prevSigningKeyPassword, "Process")

    # Free unmanaged BSTR memory if allocated
    if ($bstr -ne [IntPtr]::Zero) {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        $bstr = [IntPtr]::Zero
    }
    $plainPass = $null
}
