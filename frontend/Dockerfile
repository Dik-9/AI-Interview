# ===== Stage 1: 构建前端静态文件 =====
FROM node:18-alpine AS build
WORKDIR /app

# 复制依赖清单
COPY package*.json ./
RUN npm ci || npm install

# 复制源码
COPY . .

# 部署时前端经 nginx 反代 /api 访问后端（同源无跨域）
# 本地 .env 已被 .dockerignore 排除，此处写入部署用的 .env
RUN echo 'VITE_API_BASE_URL=/api' > .env

# 构建
RUN npm run build

# ===== Stage 2: nginx 托管静态文件 =====
FROM nginx:alpine

# 复制构建产物
COPY --from=build /app/dist /usr/share/nginx/html

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
