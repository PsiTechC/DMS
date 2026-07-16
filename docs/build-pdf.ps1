# Regenerates DMS-Project-Overview.pdf from project-overview.html.
# Run this after editing the HTML:  powershell -File docs\build-pdf.ps1
#
# ASCII only, deliberately: Windows PowerShell 5.1 reads a UTF-8 file with no
# BOM as ANSI, which mangles characters like em-dashes into a parse error.

$ErrorActionPreference = "Stop"

$docs = $PSScriptRoot
$src  = Join-Path $docs "project-overview.html"
$out  = Join-Path $docs "DMS-Project-Overview.pdf"

if (-not (Test-Path $src)) { throw "Source not found: $src" }

# Prefer Edge, fall back to Chrome. Either can print headlessly.
$browser = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $browser) {
  throw "Neither Edge nor Chrome was found, so the PDF cannot be rendered."
}

Write-Host "Rendering with $(Split-Path $browser -Leaf) ..."

# Render to a temp path first, so a failed run cannot destroy a good PDF.
$tmpOut     = Join-Path $env:TEMP "dms-overview-$PID.pdf"
$profileDir = Join-Path $env:TEMP "dms-pdf-profile"   # throwaway: keeps out of the real browser session
$uri        = ([System.Uri]$src).AbsoluteUri

if (Test-Path $tmpOut) { Remove-Item $tmpOut -Force }

# Edge writes routine noise to stderr even on success. Under PowerShell 5.1,
# piping that through 2>&1 while ErrorActionPreference is Stop turns it into a
# terminating NativeCommandError and aborts a run that actually worked. So:
# let stderr through untouched, relax the preference, and judge the result by
# whether a PDF appeared.
$prev = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $browser --headless --disable-gpu --no-first-run --no-pdf-header-footer `
           --user-data-dir="$profileDir" `
           --print-to-pdf="$tmpOut" $uri | Out-Null
$ErrorActionPreference = $prev

# --print-to-pdf writes asynchronously, so wait for the file to appear.
foreach ($i in 1..40) {
  if (Test-Path $tmpOut) { break }
  Start-Sleep -Milliseconds 500
}

if (-not (Test-Path $tmpOut)) { throw "PDF was not produced (browser exit code $LASTEXITCODE)." }

# Confirm it is a real PDF before replacing the existing one.
$sig = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($tmpOut)[0..3])
if ($sig -ne "%PDF") { Remove-Item $tmpOut -Force; throw "Output was not a valid PDF." }

Move-Item $tmpOut $out -Force

$kb = [math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Host "Done -> $out ($kb KB)" -ForegroundColor Green
