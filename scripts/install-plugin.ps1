# Cài Premiere MCP v2 thành plugin UXP "External" (bền vững, như Beat Shake / Mic Check) để không
# phải nạp lại bằng UXP Developer Tool mỗi lần mở Premiere. Chạy lại script mỗi khi sửa code plugin/
# để đồng bộ bản cài. Idempotent; luôn backup premierepro.json trước khi sửa.
#   .\scripts\install-plugin.ps1            # cài / cập nhật
#   .\scripts\install-plugin.ps1 -Uninstall # gỡ
param([switch]$Uninstall)

$ErrorActionPreference = "Stop"
$repo     = Split-Path -Parent $PSScriptRoot
$src      = Join-Path $repo "plugin"
$manifest = Get-Content (Join-Path $src "manifest.json") -Raw | ConvertFrom-Json
$id       = $manifest.id
$ver      = $manifest.version
$uxpRoot  = Join-Path $env:APPDATA "Adobe\UXP"
$dest     = Join-Path $uxpRoot "Plugins\External\${id}_${ver}"
$regFile  = Join-Path $uxpRoot "PluginsInfo\v1\premierepro.json"

if (-not (Test-Path $regFile)) { throw "Không thấy $regFile - mở Premiere Pro ít nhất 1 lần trước." }

$reg = Get-Content $regFile -Raw | ConvertFrom-Json
Copy-Item $regFile "$regFile.bak" -Force
$others = @($reg.plugins | Where-Object { $_.pluginId -ne $id })

if ($Uninstall) {
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    $reg.plugins = $others
    Write-Host "Đã gỡ $id"
} else {
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    Copy-Item $src $dest -Recurse -Force
    $entry = [pscustomobject]@{
        hostMinVersion = $manifest.host.minVersion
        name           = "Premiere MCP v2"
        path           = "`$localPlugins\External\${id}_${ver}"
        pluginId       = $id
        status         = "enabled"
        type           = "uxp"
        versionString  = $ver
    }
    $reg.plugins = $others + $entry
    Write-Host "Đã cài $id $ver -> $dest"
}

[System.IO.File]::WriteAllText($regFile, ($reg | ConvertTo-Json -Depth 5 -Compress), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Đã cập nhật $regFile (backup: premierepro.json.bak). Khởi động lại Premiere Pro để nạp."
