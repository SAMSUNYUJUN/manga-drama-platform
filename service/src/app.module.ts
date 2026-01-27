import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { StorageModule } from './storage/storage.module';
import { AIServiceModule } from './ai-service/ai-service.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { TaskModule } from './task/task.module';
import { AssetModule } from './asset/asset.module';
import { JwtAuthGuard, RolesGuard } from './auth/guards';
import { ScriptModule } from './script/script.module';
import { PromptModule } from './prompt/prompt.module';
import { AdminModule } from './admin/admin.module';
import { WorkflowModule } from './workflow/workflow.module';
import { SeedModule } from './database/seed/seed.module';
import { NodeToolModule } from './node-tool/node-tool.module';
import { WorkbenchModule } from './workbench/workbench.module';
import { StoryboardModule } from './storyboard/storyboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    AuthModule,
    UserModule,
    TaskModule,
    AssetModule,
    StorageModule,
    AIServiceModule,
    ScriptModule,
    PromptModule,
    AdminModule,
    WorkflowModule,
    NodeToolModule,
    WorkbenchModule,
    SeedModule,
    StoryboardModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
