#!/bin/bash

# Linux/Mac部署脚本

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 颜色定义
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

show_help() {
    echo -e "${CYAN}========================================"
    echo -e "  漫剧生产平台 - 部署脚本"
    echo -e "========================================${NC}"
    echo ""
    echo -e "${YELLOW}使用方法: ./scripts/deploy.sh <action>${NC}"
    echo ""
    echo -e "${GREEN}可用命令:${NC}"
    echo "  dev          - 启动开发环境"
    echo "  dev-stop     - 停止开发环境"
    echo "  prod         - 部署生产环境"
    echo "  prod-start   - 启动生产服务"
    echo "  prod-stop    - 停止生产服务"
    echo "  prod-restart - 重启生产服务"
    echo "  build        - 构建项目"
    echo "  status       - 查看服务状态"
    echo "  logs         - 查看日志"
    echo "  check        - 环境检查"
    echo ""
}

start_dev() {
    echo -e "${GREEN}启动开发环境...${NC}"
    
    # 检查环境变量
    if [ ! -f "$PROJECT_ROOT/service/.env" ]; then
        echo -e "${YELLOW}警告: service/.env 不存在，请复制.env.example并配置${NC}"
    fi
    
    # 启动后端
    echo -e "${CYAN}启动后端服务...${NC}"
    cd "$PROJECT_ROOT/service"
    npm run start:dev &
    
    sleep 3
    
    # 启动前端
    echo -e "${CYAN}启动前端服务...${NC}"
    cd "$PROJECT_ROOT/frontend"
    npm run dev &
    
    echo -e "${GREEN}开发环境已启动！${NC}"
    echo -e "${CYAN}前端: http://localhost:5173${NC}"
    echo -e "${CYAN}后端: http://localhost:3001${NC}"
}

build_project() {
    echo -e "${GREEN}构建项目...${NC}"
    
    # 构建后端
    echo -e "${CYAN}构建后端...${NC}"
    cd "$PROJECT_ROOT/service"
    npm run build
    
    # 构建前端
    echo -e "${CYAN}构建前端...${NC}"
    cd "$PROJECT_ROOT/frontend"
    npm run build
    
    cd "$PROJECT_ROOT"
    echo -e "${GREEN}构建完成！${NC}"
}

deploy_production() {
    echo -e "${GREEN}部署生产环境...${NC}"
    
    # 检查PM2
    if ! command -v pm2 &> /dev/null; then
        echo -e "${RED}错误: 未安装PM2，请运行: npm install -g pm2${NC}"
        exit 1
    fi
    
    # 构建项目
    build_project
    
    # 停止旧服务
    echo -e "${CYAN}停止旧服务...${NC}"
    pm2 stop manga-drama-backend manga-drama-frontend 2>/dev/null || true
    
    # 启动服务
    echo -e "${CYAN}启动服务...${NC}"
    cd "$PROJECT_ROOT"
    pm2 start ecosystem.config.js
    pm2 save
    
    echo -e "${GREEN}生产环境部署完成！${NC}"
    echo -e "${CYAN}前端: http://localhost:3003${NC}"
    echo -e "${CYAN}后端: http://localhost:3002${NC}"
}

show_status() {
    pm2 list
}

show_logs() {
    pm2 logs
}

check_environment() {
    echo -e "${GREEN}环境检查...${NC}"
    
    # Node.js
    echo -e "\n${CYAN}Node.js版本:${NC}"
    node --version
    
    # npm
    echo -e "\n${CYAN}npm版本:${NC}"
    npm --version
    
    # PM2
    echo -e "\n${CYAN}PM2:${NC}"
    if command -v pm2 &> /dev/null; then
        pm2 --version
    else
        echo -e "${YELLOW}未安装 (可选)${NC}"
    fi
    
    # 环境变量文件
    echo -e "\n${CYAN}环境变量文件:${NC}"
    if [ -f "$PROJECT_ROOT/service/.env" ]; then
        echo -e "${GREEN}✓ service/.env 存在${NC}"
    else
        echo -e "${RED}✗ service/.env 不存在${NC}"
    fi
    
    if [ -f "$PROJECT_ROOT/frontend/.env" ]; then
        echo -e "${GREEN}✓ frontend/.env 存在${NC}"
    else
        echo -e "${YELLOW}✗ frontend/.env 不存在（可选）${NC}"
    fi
}

# 执行命令
case "${1}" in
    dev)
        start_dev
        ;;
    dev-stop)
        pkill -f "npm run start:dev"
        pkill -f "npm run dev"
        echo -e "${GREEN}开发环境已停止${NC}"
        ;;
    prod)
        deploy_production
        ;;
    prod-start)
        pm2 start manga-drama-backend manga-drama-frontend
        ;;
    prod-stop)
        pm2 stop manga-drama-backend manga-drama-frontend
        ;;
    prod-restart)
        pm2 restart manga-drama-backend manga-drama-frontend
        ;;
    build)
        build_project
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    check)
        check_environment
        ;;
    *)
        show_help
        ;;
esac
