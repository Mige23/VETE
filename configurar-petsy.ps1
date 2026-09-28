$ErrorActionPreference = "Stop"

try {
    $Host.UI.RawUI.WindowTitle = "Configurar Petsy"
} catch {
    # El titulo es opcional y no afecta a la configuracion.
}

Write-Host ""
Write-Host "CONFIGURAR PETSY" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pegá aquí la clave NUEVA de Gemini." -ForegroundColor White
Write-Host "La clave quedará guardada únicamente en este equipo y no se mostrará en pantalla." -ForegroundColor DarkGray
Write-Host ""

$secureKey = $null
$keyPointer = [IntPtr]::Zero
$plainKey = $null

try {
    $secureKey = Read-Host "Clave privada" -AsSecureString
    $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer).Trim()

    if ([string]::IsNullOrWhiteSpace($plainKey) -or $plainKey.Length -lt 20) {
        throw "La clave parece incompleta. Creá una clave nueva en Google AI Studio e intentá otra vez."
    }

    if ($plainKey -match "[\r\n\s=]") {
        throw "La clave contiene espacios o caracteres no válidos. Copiala nuevamente completa."
    }

    $secretBytes = New-Object byte[] 32
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $random.GetBytes($secretBytes)
    } finally {
        $random.Dispose()
    }
    $signingSecret = -join ($secretBytes | ForEach-Object { $_.ToString("x2") })

    $projectRoot = Split-Path -Parent $PSScriptRoot
    $privateFile = Join-Path $projectRoot "api\.env"
    $settings = @(
        "GEMINI_API_KEY=$plainKey"
        "GEMINI_MODEL=gemini-3.5-flash"
        "GEMINI_MAX_OUTPUT_TOKENS=900"
        "CHAT_SIGNING_SECRET=$signingSecret"
        "ALLOWED_ORIGIN=http://127.0.0.1:8765"
        "CHAT_MAX_MESSAGE_LENGTH=2000"
        "CHAT_RATE_LIMIT_5M=8"
        "CHAT_RATE_LIMIT_DAY=40"
        ""
    ) -join [Environment]::NewLine

    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($privateFile, $settings, $utf8WithoutBom)

    Write-Host ""
    Write-Host "LISTO: Petsy quedó conectada de forma privada con Gemini." -ForegroundColor Green
    Write-Host "Ya podés volver a esta conversación." -ForegroundColor White
} catch {
    Write-Host ""
    Write-Host "No se pudo guardar la clave." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Yellow
} finally {
    if ($keyPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    }
    $plainKey = $null
    $secureKey = $null
}

Write-Host ""
[void](Read-Host "Presioná Enter para cerrar")
