param(
  [string]$CertName = "GC Net",
  [string]$CertPassword = "gchubpassword123",
  [string]$OutputPfx = "gcnet-codesign.pfx"
)

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "GC-NET CODE SIGNING CERTIFICATE GENERATOR (.NET Pure)" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

$pfxPath = Join-Path $PSScriptRoot "..\certs\$OutputPfx"
$certDir = Split-Path $pfxPath -Parent
if (-not (Test-Path $certDir)) {
  New-Item -ItemType Directory -Path $certDir -Force | Out-Null
}

Write-Host "[1/2] Generating RSA 2048-bit Code Signing Certificate..." -ForegroundColor Yellow
$rsa = [System.Security.Cryptography.RSA]::Create(2048)
$distinguishedName = New-Object System.Security.Cryptography.X509Certificates.X500DistinguishedName("CN=$CertName, O=GC Net, C=ID")
$req = New-Object System.Security.Cryptography.X509Certificates.CertificateRequest(
  $distinguishedName,
  $rsa,
  [System.Security.Cryptography.HashAlgorithmName]::SHA256,
  [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
)

# Enhanced Key Usage: Code Signing (OID: 1.3.6.1.5.5.7.3.3)
$oid = New-Object System.Security.Cryptography.Oid("1.3.6.1.5.5.7.3.3", "Code Signing")
$oidCollection = New-Object System.Security.Cryptography.OidCollection
$oidCollection.Add($oid) | Out-Null
$eku = New-Object System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension($oidCollection, $false)
$req.CertificateExtensions.Add($eku)

# Key Usage: DigitalSignature
$ku = New-Object System.Security.Cryptography.X509Certificates.X509KeyUsageExtension(
  [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature,
  $true
)
$req.CertificateExtensions.Add($ku)

# Self-signed for 5 years
$notBefore = [DateTimeOffset]::UtcNow.AddDays(-1)
$notAfter = [DateTimeOffset]::UtcNow.AddYears(5)
$cert = $req.CreateSelfSigned($notBefore, $notAfter)

# Export PFX with Private Key and Password
$pfxBytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $CertPassword)
[System.IO.File]::WriteAllBytes($pfxPath, $pfxBytes)

Write-Host "  -> Thumbprint: $($cert.Thumbprint)" -ForegroundColor Green
Write-Host "[2/2] Exported Code Signing PFX to: $pfxPath" -ForegroundColor Green

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "CERTIFICATE GENERATION SUCCESSFUL!" -ForegroundColor Green
Write-Host "PFX Path: $pfxPath"
Write-Host "Password: $CertPassword"
Write-Host "======================================================" -ForegroundColor Cyan
