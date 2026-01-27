import 'tsconfig-paths/register';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';
import dns from 'node:dns';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignore for older Node runtimes.
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // 启用全局验证管道
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  app.useGlobalFilters(new HttpExceptionFilter());

  const localStoragePath = process.env.LOCAL_STORAGE_PATH || '../storage/uploads';
  app.useStaticAssets(path.resolve(process.cwd(), localStoragePath), {
    prefix: '/uploads',
  });

  // 启用CORS
  const envAllowed = (process.env.ALLOW_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const defaultAllowed = [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4026',
    'http://127.0.0.1:4026',
  ].filter(Boolean);
  const allowedOrigins = Array.from(new Set([...envAllowed, ...defaultAllowed]));

  app.enableCors({
    origin: (origin, callback) => {
      // 允许没有 origin 的请求 (比如移动端或 curl)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('http://localhost:')) {
        callback(null, true);
      } else if (process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  });

  // 设置全局前缀
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3001;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host as any);
  console.log(`🚀 Application is running on: http://${host}:${port}/api`);
}
bootstrap();
