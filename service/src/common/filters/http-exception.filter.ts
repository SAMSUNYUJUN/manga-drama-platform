import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = exception instanceof HttpException 
      ? exception.getResponse() 
      : null;

    const message = (typeof exceptionResponse === 'object' && exceptionResponse !== null)
      ? (exceptionResponse as any).message || exception.message
      : exception.message || '服务器内部错误';

    const errorResponse = {
      success: false,
      data: null,
      message: Array.isArray(message) ? message[0] : message, // 处理 class-validator 的数组错误
      error: {
        code: (exceptionResponse as any)?.error || exception.name || 'INTERNAL_ERROR',
        details: exceptionResponse,
      },
    };

    response.status(status).json(errorResponse);
  }
}
