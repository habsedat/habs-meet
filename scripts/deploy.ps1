# Habs Meet Deployment Script for Windows
# Usage: .\scripts\deploy.ps1 [dev|prod]

param(
    [string]$Environment = "dev"
)

if ($Environment -ne "dev" -and $Environment -ne "prod") {
    Write-Host "❌ Invalid environment. Use 'dev' or 'prod'" -ForegroundColor Red
    Write-Host "Usage: .\scripts\deploy.ps1 [dev|prod]"
    exit 1
}

Write-Host "🚀 Deploying Habs Meet to $Environment environment..." -ForegroundColor Green

# Set Firebase project
if ($Environment -eq "dev") {
    $Project = "habs-meet-dev"
} else {
    $Project = "habs-meet-prod"
}

Write-Host "📋 Using Firebase project: $Project" -ForegroundColor Blue

# Switch to project
firebase use $Project

# Build web app
Write-Host "🔨 Building web application..." -ForegroundColor Yellow
Set-Location apps/web
pnpm build
Set-Location ../..

# Deploy to Firebase
Write-Host "☁️ Deploying to Firebase..." -ForegroundColor Yellow
firebase deploy --only hosting,functions

Write-Host "✅ Deployment completed successfully!" -ForegroundColor Green
Write-Host "🌐 Your app is now live at: https://$Project.web.app" -ForegroundColor Cyan

# Show useful commands
Write-Host ""
Write-Host "📝 Useful commands:" -ForegroundColor Blue
Write-Host "  View logs: firebase functions:log"
Write-Host "  Open app: firebase open hosting:site"
Write-Host "  Emulator: firebase emulators:start"







