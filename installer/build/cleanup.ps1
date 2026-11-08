# Dot-sourced by the delayed cleanup helper and by isolated behavior tests.
function Test-OryviaPlainDirectory([string]$Directory) {
    $current = $Directory
    while ($current) {
        $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop
        if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { return $false }
        $parent = [IO.Directory]::GetParent($current)
        if (-not $parent) { break }
        $current = $parent.FullName
    }
    return $true
}

function Test-OryviaLegalDirOwned([string]$LegalDir, [string]$ExpectedScope) {
    if (-not (Test-Path -LiteralPath $LegalDir -PathType Container)) { return $false }
    $dirItem = Get-Item -LiteralPath $LegalDir -Force -ErrorAction SilentlyContinue
    if (-not $dirItem -or -not $dirItem.PSIsContainer -or ($dirItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { return $false }

    $scopeMarker = Join-Path $LegalDir '.legal-scope'
    if (-not (Test-Path -LiteralPath $scopeMarker -PathType Leaf)) { return $false }
    $markerItem = Get-Item -LiteralPath $scopeMarker -Force -ErrorAction SilentlyContinue
    if (-not $markerItem -or $markerItem.PSIsContainer -or ($markerItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { return $false }

    try {
        $markerContent = [IO.File]::ReadAllText($scopeMarker).Trim()
        if ($markerContent -cne $ExpectedScope) { return $false }
    } catch {
        # Never infer ownership from read error or locked marker!
        return $false
    }

    # Inspect all items inside LegalDir. Only managed legal files are permitted.
    $items = Get-ChildItem -LiteralPath $LegalDir -Force -ErrorAction SilentlyContinue
    if ($null -eq $items) { return $false }
    foreach ($item in $items) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { return $false }
        if ($item.PSIsContainer) { return $false }
        if ($item.Name -notin @('LICENSE', 'NOTICE', '.legal-scope')) {
            # Contains foreign or unverified file. Never claim full directory ownership.
            return $false
        }
    }
    return $true
}

function Invoke-OryviaFileCleanup {
    param([string]$Directory, [string]$ExpectedScope, [scriptblock]$Finalize = {},
          [scriptblock]$BeforeDelete = { 'uninstall.exe' }, [int]$Attempts = 40,
          [int]$DelayMilliseconds = 500, [string]$LogPath = (Join-Path $env:TEMP 'oryvia-uninstall-pending.log'))
    $marker = Join-Path $Directory '.install-scope'
    $files = @((Join-Path $Directory 'oryvia.exe'), (Join-Path $Directory 'uninstall.exe'))
    $legalDir = Join-Path $Directory 'oryvia-legal'
    try {
        for ($i = 0; $i -lt $Attempts; $i++) {
            if (-not (Test-OryviaPlainDirectory $Directory)) { throw 'Install directory became a reparse point or is not a plain directory.' }
            $markerItem = Get-Item -LiteralPath $marker -Force -ErrorAction SilentlyContinue
            if ($markerItem -and ($markerItem.PSIsContainer -or ($markerItem.Attributes -band [IO.FileAttributes]::ReparsePoint))) { throw 'Install marker is a directory or reparse point.' }
            if (-not (Test-Path -LiteralPath $marker -PathType Leaf) -or
                (Get-Content -LiteralPath $marker -Raw -ErrorAction Stop).Trim() -cne $ExpectedScope) { throw 'Install scope marker is missing or changed; cleanup stopped.' }
            # Delete the executable referenced by registration LAST. If the
            # other binary is locked or docs remain, the registered entry point stays usable.
            $retryExecutable = & $BeforeDelete
            if ($retryExecutable -notin @('oryvia.exe', 'uninstall.exe')) { throw 'Unverified retry executable' }
            $last = Join-Path $Directory $retryExecutable
            $first = $files | Where-Object { $_ -cne $last }

            # 1. Try to delete the non-registered executable ($first).
            # If $first is locked (e.g. app still running), do not delete docs or the retry executable.
            $firstItem = Get-Item -LiteralPath $first -Force -ErrorAction SilentlyContinue
            if ($firstItem -and -not $firstItem.PSIsContainer -and -not ($firstItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                Remove-Item -LiteralPath $first -Force -ErrorAction SilentlyContinue
            }

            $firstRemaining = (Test-Path -LiteralPath $first)

            # Check if oryvia-legal is an owned legal directory
            $legalDirOwned = Test-OryviaLegalDirOwned $legalDir $ExpectedScope

            # 2. Only if $first is gone: try to delete owned documentation files (foreign docs are untouched).
            if (-not $firstRemaining -and $legalDirOwned) {
                foreach ($doc in @('LICENSE', 'NOTICE')) {
                    $docPath = Join-Path $legalDir $doc
                    $docItem = Get-Item -LiteralPath $docPath -Force -ErrorAction SilentlyContinue
                    if ($docItem -and -not $docItem.PSIsContainer -and -not ($docItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                        Remove-Item -LiteralPath $docPath -Force -ErrorAction SilentlyContinue
                    }
                }
                # Only remove .legal-scope marker after content documents are confirmed deleted.
                $contentDocsRemaining = @(@('LICENSE', 'NOTICE') | ForEach-Object { Join-Path $legalDir $_ } | Where-Object { Test-Path -LiteralPath $_ })
                if ($contentDocsRemaining.Count -eq 0) {
                    $scopeMarker = Join-Path $legalDir '.legal-scope'
                    $scopeItem = Get-Item -LiteralPath $scopeMarker -Force -ErrorAction SilentlyContinue
                    if ($scopeItem -and -not $scopeItem.PSIsContainer -and -not ($scopeItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                        Remove-Item -LiteralPath $scopeMarker -Force -ErrorAction SilentlyContinue
                    }
                }
            }

            # 3. Check remaining non-registered executable and owned docs
            $docsRemaining = if ($legalDirOwned) {
                @(@('LICENSE', 'NOTICE', '.legal-scope') | ForEach-Object { Join-Path $legalDir $_ } | Where-Object { Test-Path -LiteralPath $_ })
            } else {
                @()
            }

            # 4. If $first is gone AND all owned docs are gone: delete the registered retry executable ($last).
            if (-not $firstRemaining -and $docsRemaining.Count -eq 0) {
                if ($legalDirOwned -and (Test-Path -LiteralPath $legalDir)) {
                    $remainingInLegal = Get-ChildItem -LiteralPath $legalDir -Force -ErrorAction SilentlyContinue
                    if (-not $remainingInLegal -or $remainingInLegal.Count -eq 0) {
                        Remove-Item -LiteralPath $legalDir -Force -ErrorAction SilentlyContinue
                    }
                }
                $lastItem = Get-Item -LiteralPath $last -Force -ErrorAction SilentlyContinue
                if ($lastItem -and -not $lastItem.PSIsContainer -and -not ($lastItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                    Remove-Item -LiteralPath $last -Force -ErrorAction SilentlyContinue
                }
            }

            $left = @($files | Where-Object { Test-Path -LiteralPath $_ }) + $docsRemaining
            if ($left.Count -eq 0) {
                # All owned executables and docs are confirmed deleted.
                & $Finalize
                Remove-Item -LiteralPath $marker -Force -ErrorAction Stop
                return $true
            }
            if ($i + 1 -lt $Attempts) { Start-Sleep -Milliseconds $DelayMilliseconds }
        }
        throw ('Cleanup incomplete; marker and registration retained. Remaining: ' + ($left -join ', '))
    } catch {
        $entry = ('{0:o} | {1} | {2} | Retry helper: {3}' -f [DateTime]::UtcNow, $Directory, $_.Exception.Message, $PSCommandPath)
        Add-Content -LiteralPath $LogPath -Value $entry -ErrorAction SilentlyContinue
        return $false
    }
}
