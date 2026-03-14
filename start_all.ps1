# Kill existing processes on ports 3000 and 8000
Write-Host "Cleaning up ports 3000 and 8000..." -ForegroundColor Cyan
Get-NetTCPConnection -LocalPort 3000, 8000 -ErrorAction SilentlyContinue | ForEach-Object { 
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue 
}

# Start both using the unified npm command
Write-Host "Starting Backend and Frontend together..." -ForegroundColor Green
npm run dev
