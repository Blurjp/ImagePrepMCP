# Auto-configure Claude Desktop for Figma Smart Image MCP with proper timeout
# PowerShell script for Windows

Write-Host "🔧 Configuring Claude Desktop for Figma Smart Image MCP..." -ForegroundColor Cyan

$ConfigDir = "$env:APPDATA\Claude"
$ConfigFile = "$ConfigDir\claude_desktop_config.json"

# Create directory if it doesn't exist
if (-not (Test-Path $ConfigDir)) {
    New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null
}

# Check if config file exists
if (-not (Test-Path $ConfigFile)) {
    Write-Host "📝 Creating new configuration file..." -ForegroundColor Yellow
    '{"mcpServers":{}}' | Out-File -FilePath $ConfigFile -Encoding UTF8
}

# Read existing config
$Config = Get-Content $ConfigFile | ConvertFrom-Json

# Ensure mcpServers exists
if (-not $Config.PSObject.Properties.Name -contains "mcpServers") {
    $Config | Add-Member -MemberType NoteProperty -Name "mcpServers" -Value @{}
}

# Check if server already exists
if ($Config.mcpServers.PSObject.Properties.Name -contains "figma-smart-image") {
    Write-Host "⚠️  figma-smart-image already exists in config" -ForegroundColor Yellow
    $Response = Read-Host "Do you want to update it? (y/n)"
    if ($Response -ne "y" -and $Response -ne "Y") {
        Write-Host "❌ Cancelled" -ForegroundColor Red
        exit 0
    }
}

# Add or update figma-smart-image
$ServerConfig = @{
    url = "https://figma-smart-image-mcp-production.up.railway.app/mcp"
    timeout = 180000
}

if ($Config.mcpServers.PSObject.Properties.Name -contains "figma-smart-image") {
    $Config.mcpServers."figma-smart-image" = $ServerConfig
} else {
    $Config.mcpServers | Add-Member -MemberType NoteProperty -Name "figma-smart-image" -Value $ServerConfig
}

# Write back
$Config | ConvertTo-Json -Depth 10 | Out-File -FilePath $ConfigFile -Encoding UTF8

Write-Host ""
Write-Host "✅ Configuration updated successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Done! Configuration saved to:" -ForegroundColor Green
Write-Host "   $ConfigFile" -ForegroundColor White
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Restart Claude Desktop" -ForegroundColor White
Write-Host "   2. Visit https://figma-smart-image-mcp-production.up.railway.app/ to authenticate" -ForegroundColor White
Write-Host "   3. Try asking Claude to process a Figma link!" -ForegroundColor White
