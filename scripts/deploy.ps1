# Windows PowerShell部署脚本

param(
    [string]$Action = "help"
)

$ProjectRoot = Split-Path -Parent $PSScriptRoot

function Show-Help {
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  漫剧生产平台 - 部署脚本" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "使用方法: .\scripts\deploy.ps1 <action>" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "可用命令:" -ForegroundColor Green
    Write-Host "  dev          - 启动开发环境"
    Write-Host "  dev-stop     - 停止开发环境"
    Write-Host "  prod         - 部署生产环境"
    Write-Host "  prod-start   - 启动生产服务"
    Write-Host "  prod-stop    - 停止生产服务"
    Write-Host "  prod-restart - 重启生产服务"
    Write-Host "  build        - 构建项目"
    Write-Host "  status       - 查看服务状态"
    Write-Host "  logs         - 查看日志"
    Write-Host "  check        - 环境检查"
    Write-Host ""
}

function Start-Dev {
    Write-Host "启动开发环境..." -ForegroundColor Green
    
    # 检查环境变量
    if (-not (Test-Path "$ProjectRoot\service\.env")) {
        Write-Host "警告: service/.env 不存在，请复制.env.example并配置" -ForegroundColor Yellow
    }
    
    # 启动后端
    Write-Host "启动后端服务..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot\service'; npm run start:dev"
    
    Start-Sleep -Seconds 3
    
    # 启动前端
    Write-Host "启动前端服务..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot\frontend'; npm run dev"
    
    Write-Host "开发环境已启动！" -ForegroundColor Green
    Write-Host "前端: http://localhost:5173" -ForegroundColor Cyan
    Write-Host "后端: http://localhost:3001" -ForegroundColor Cyan
}

function Build-Project {
    Write-Host "构建项目..." -ForegroundColor Green
    
    # 构建后端
    Write-Host "构建后端..." -ForegroundColor Cyan
    Set-Location "$ProjectRoot\service"
    npm run build
    
    # 构建前端
    Write-Host "构建前端..." -ForegroundColor Cyan
    Set-Location "$ProjectRoot\frontend"
    npm run build
    
    Set-Location $ProjectRoot
    Write-Host "构建完成！" -ForegroundColor Green
}

function Deploy-Production {
    Write-Host "部署生产环境..." -ForegroundColor Green
    
    # 检查PM2
    $pm2Check = Get-Command pm2 -ErrorAction SilentlyContinue
    if (-not $pm2Check) {
        Write-Host "错误: 未安装PM2，请运行: npm install -g pm2" -ForegroundColor Red
        return
    }
    
    # 构建项目
    Build-Project
    
    # 停止旧服务
    Write-Host "停止旧服务..." -ForegroundColor Cyan
    pm2 stop manga-drama-backend manga-drama-frontend 2>$null
    
    # 启动服务
    Write-Host "启动服务..." -ForegroundColor Cyan
    Set-Location $ProjectRoot
    pm2 start ecosystem.config.js
    pm2 save
    
    Write-Host "生产环境部署完成！" -ForegroundColor Green
    Write-Host "前端: http://localhost:3003" -ForegroundColor Cyan
    Write-Host "后端: http://localhost:3002" -ForegroundColor Cyan
}

function Show-Status {
    pm2 list
}

function Show-Logs {
    pm2 logs
}

function Check-Environment {
    Write-Host "环境检查..." -ForegroundColor Green
    
    # Node.js
    Write-Host "`nNode.js版本:" -ForegroundColor Cyan
    node --version
    
    # npm
    Write-Host "`nnpm版本:" -ForegroundColor Cyan
    npm --version
    
    # PM2
    Write-Host "`nPM2:" -ForegroundColor Cyan
    $pm2Check = Get-Command pm2 -ErrorAction SilentlyContinue
    if ($pm2Check) {
        pm2 --version
    } else {
        Write-Host "未安装 (可选)" -ForegroundColor Yellow
    }
    
    # 环境变量文件
    Write-Host "`n环境变量文件:" -ForegroundColor Cyan
    if (Test-Path "$ProjectRoot\service\.env") {
        Write-Host "✓ service/.env 存在" -ForegroundColor Green
    } else {
        Write-Host "✗ service/.env 不存在" -ForegroundColor Red
    }
    
    if (Test-Path "$ProjectRoot\frontend\.env") {
        Write-Host "✓ frontend/.env 存在" -ForegroundColor Green
    } else {
        Write-Host "✗ frontend/.env 不存在（可选）" -ForegroundColor Yellow
    }
}

# 执行命令
switch ($Action) {
    "dev" { Start-Dev }
    "dev-stop" { 
        Write-Host "请手动关闭开发环境的PowerShell窗口" -ForegroundColor Yellow
    }
    "prod" { Deploy-Production }
    "prod-start" { pm2 start manga-drama-backend manga-drama-frontend }
    "prod-stop" { pm2 stop manga-drama-backend manga-drama-frontend }
    "prod-restart" { pm2 restart manga-drama-backend manga-drama-frontend }
    "build" { Build-Project }
    "status" { Show-Status }
    "logs" { Show-Logs }
    "check" { Check-Environment }
    default { Show-Help }
}
