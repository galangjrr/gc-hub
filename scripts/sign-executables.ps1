<#
.SYNOPSIS
  Sign GC-Hub release executables with digital signature and RFC 3161 timestamp.
  Prevents Windows SmartScreen untrusted application warnings.
#>

param(
  [string]$CertPfxPath = "certs/gcnet-codesign.pfx",
  [string]$CertPassword = "gchubpassword123",
  [string]$ReleaseDir = "release"
)

$rootDir = Split-Path $PSScriptRoot -Parent
$pfxFullPath = Join-Path $rootDir $CertPfxPath
$releaseFullPath = Join-Path $rootDir $ReleaseDir

if (-not (Test-Path $pfxFullPath)) {
  Write-Warning "Certificate file '$pfxFullPath' not found. Run scripts/create-dev-cert.ps1 first to create one."
  exit 0
}

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "✍️  SIGNING GC-HUB EXECUTABLES WITH DIGITAL SIGNATURE" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

$securePassword = ConvertTo-SecureString -String $CertPassword -Force -AsPlainText
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($pfxFullPath, $securePassword)

$exeFiles = Get-ChildItem -Path $releaseFullPath -Recurse -Include "GC-Hub-Server.exe", "GC-Hub-Client.exe", "*.exe"

foreach ($exe in $exeFiles) {
  Write-Host "Signing: $($exe.FullName)..." -ForegroundColor Yellow
  try {
    # Sign with SHA256 and DigiCert RFC3161 Timestamp Server
    $res = Set-AuthenticodeSignature `
      -FilePath $exe.FullName `
      -Certificate $cert `
      -TimestampServer "http://timestamp.digicert.com" `
      -HashAlgorithm SHA256

    if ($res.Status -eq "Valid") {
      Write-Host "  -> Successfully Signed ($($res.Status))" -ForegroundColor Green
    } else {
      Write-Host "  -> Signed (Status: $($res.Status))" -ForegroundColor Yellow
    }
  } catch {
    Write-Warning "Failed to sign $($exe.Name): $_"
  }
}

Write-Host "`nDigital signing finished.`n" -ForegroundColor Green
