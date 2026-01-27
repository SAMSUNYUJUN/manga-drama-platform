## 阿里云 ECS（Ubuntu）一键上线指引（无域名，直连公网 IP）

### 0. 前提
- ECS 已开通公网 IP，安全组放行 **4025**（后端）、**4026**（前端）。
- 已安装 Node.js ≥ 18、npm ≥ 8；如未装：
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```
- 推荐装 PM2（进程守护）：
  ```bash
  sudo npm i -g pm2
  ```

### 1. 拉代码与依赖
```bash
ssh ubuntu@<PUBLIC_IP>
git clone https://gitee.com/你的仓库.git
cd manga-drama-platform
chmod +x scripts/deploy.sh scripts/update.sh
```

### 2. 配置环境变量
- 后端：复制 `service/.env.production.example` 为 `service/.env`，替换 `<PUBLIC_IP>`、`JWT_SECRET`、各 API KEY。
- 前端：复制 `frontend/.env.production.example` 为 `frontend/.env.production`，把 `<PUBLIC_IP>` 换成真实 IP。

### 3. 首次部署（自动装依赖、构建、启动 PM2）
```bash
bash scripts/deploy.sh
```
- 后端使用 `npm ci`，前端使用 `npm install`（需刷新 lock 文件以包含 serve 依赖）。
- 后端监听 `0.0.0.0:4025`，前端静态服监听 `0.0.0.0:4026`。
- 首次可执行一次 `pm2 startup`（PM2 会给出需 sudo 的命令）以开机自启。
- 查看状态/日志：
  ```bash
  pm2 list
  pm2 logs
  ```

### 4. 访问
- 前端：`http://<PUBLIC_IP>:4026`
- 后端 API：`http://<PUBLIC_IP>:4025/api`

### 5. 更新代码与平滑重启
```bash
cd /path/to/manga-drama-platform
bash scripts/update.sh
```
- 会执行 `git pull`、重新安装依赖、重新构建、`pm2 reload` 两个进程，保持平滑。

### 6. 回滚示例
```bash
git reset --hard <COMMIT_SHA>
bash scripts/update.sh
```

### 7. 排查端口占用
```bash
ss -lntp | grep -E '4025|4026'
```
- 如被占用，先停止对应进程或调整 `.env` / `ecosystem.config.js` 端口，再 `pm2 reload`.

### 8. 其他说明
- 构建命令：后端 `npm --prefix service run build`（NestJS → dist/service/src/main），前端 `npm --prefix frontend run build`（Vite → dist）。
- 前端生产启动：`npm --prefix frontend run start:prod`（`serve -s dist -l 4026`）。
- 后端生产启动：`npm --prefix service run start:prod`（`node -r tsconfig-paths/register dist/service/src/main`）。
- CORS：生产请确保 `service/.env` 中 `FRONTEND_URL` / `ALLOW_ORIGINS` 填写 `http://<PUBLIC_IP>:4026`。
