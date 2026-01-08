/**
 * 存储模块
 * @module storage
 */

import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OssStorageService } from './oss-storage.service';
import { LocalStorageService } from './local-storage.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'IStorageService',
      useFactory: (configService: ConfigService) => {
        const type = configService.get<string>('STORAGE_TYPE');
        return type === 'oss'
          ? new OssStorageService(configService)
          : new LocalStorageService(configService);
      },
      inject: [ConfigService],
    },
  ],
  exports: ['IStorageService'],
})
export class StorageModule {}
