# Start Backend and Frontend concurrently in separate windows
Write-Host "Starting Backend..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; python -m uvicorn server:app --reload" -WindowStyle Normal

Write-Host "Starting Frontend..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend-app; npm run dev" -WindowStyle Normal

Write-Host "Processes started in separate windows." -ForegroundColor Cyan
