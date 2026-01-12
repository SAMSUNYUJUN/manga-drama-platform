import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1700000000000 implements MigrationInterface {
  name = 'InitSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "username" varchar(50) NOT NULL,
        "email" varchar(100) NOT NULL,
        "password" varchar(255) NOT NULL,
        "role" varchar(20) NOT NULL DEFAULT ('USER'),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_username" ON "users" ("username")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tasks" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" int NOT NULL,
        "title" varchar(200) NOT NULL,
        "description" text,
        "status" varchar(20) NOT NULL DEFAULT ('PENDING'),
        "stage" varchar(50),
        "currentVersionId" int,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_tasks_userId" ON "tasks" ("userId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_tasks_status" ON "tasks" ("status")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "task_versions" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "taskId" int NOT NULL,
        "version" int NOT NULL,
        "stage" varchar(50) NOT NULL,
        "lockedBy" varchar(64),
        "lockedAt" datetime,
        "metadataJson" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY ("taskId") REFERENCES "tasks" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_versions_taskId" ON "task_versions" ("taskId")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uk_versions_task_version" ON "task_versions" ("taskId", "version")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "assets" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "taskId" int NOT NULL,
        "versionId" int,
        "type" varchar(50) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT ('ACTIVE'),
        "url" varchar(500) NOT NULL,
        "filename" varchar(255) NOT NULL,
        "filesize" int,
        "mimeType" varchar(100),
        "metadataJson" text,
        "replacedById" int,
        "trashedAt" datetime,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY ("taskId") REFERENCES "tasks" ("id") ON DELETE CASCADE,
        FOREIGN KEY ("versionId") REFERENCES "task_versions" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_assets_taskId" ON "assets" ("taskId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_assets_versionId" ON "assets" ("versionId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_assets_type" ON "assets" ("type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_assets_status" ON "assets" ("status")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_templates" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" varchar(120) NOT NULL,
        "description" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_template_versions" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "templateId" int NOT NULL,
        "version" int NOT NULL,
        "nodesJson" text NOT NULL,
        "edgesJson" text NOT NULL,
        "metadataJson" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY ("templateId") REFERENCES "workflow_templates" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_wf_template_versions_templateId" ON "workflow_template_versions" ("templateId")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_runs" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "templateVersionId" int NOT NULL,
        "taskId" int NOT NULL,
        "taskVersionId" int NOT NULL,
        "status" varchar(20) NOT NULL,
        "currentNodeId" varchar(64),
        "error" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY ("templateVersionId") REFERENCES "workflow_template_versions" ("id") ON DELETE CASCADE,
        FOREIGN KEY ("taskId") REFERENCES "tasks" ("id") ON DELETE CASCADE,
        FOREIGN KEY ("taskVersionId") REFERENCES "task_versions" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_wf_runs_taskVersionId" ON "workflow_runs" ("taskVersionId")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_node_runs" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "workflowRunId" int NOT NULL,
        "nodeId" varchar(64) NOT NULL,
        "nodeType" varchar(50) NOT NULL,
        "status" varchar(20) NOT NULL,
        "inputJson" text,
        "outputJson" text,
        "error" text,
        "retryCount" int NOT NULL DEFAULT (0),
        "startedAt" datetime,
        "endedAt" datetime,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY ("workflowRunId") REFERENCES "workflow_runs" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_node_runs_workflowRunId" ON "workflow_node_runs" ("workflowRunId")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "human_review_decisions" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "nodeRunId" int NOT NULL,
        "userId" int NOT NULL,
        "assetId" int NOT NULL,
        "decision" varchar(20) NOT NULL,
        "reason" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY ("nodeRunId") REFERENCES "workflow_node_runs" ("id") ON DELETE CASCADE,
        FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE,
        FOREIGN KEY ("assetId") REFERENCES "assets" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "prompt_templates" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" varchar(120) NOT NULL,
        "description" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "prompt_template_versions" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "templateId" int NOT NULL,
        "version" int NOT NULL,
        "content" text NOT NULL,
        "variablesJson" text NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY ("templateId") REFERENCES "prompt_templates" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "provider_configs" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" varchar(120) NOT NULL,
        "type" varchar(20) NOT NULL,
        "baseUrl" varchar(500) NOT NULL,
        "apiKey" text NOT NULL,
        "timeoutMs" int,
        "retryCount" int,
        "enabled" boolean NOT NULL DEFAULT (1),
        "modelsJson" text NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "global_configs" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "defaultLlmProviderId" int,
        "defaultImageProviderId" int,
        "defaultVideoProviderId" int,
        "defaultLlmModel" varchar(120),
        "defaultImageModel" varchar(120),
        "defaultVideoModel" varchar(120),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "global_configs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "provider_configs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "prompt_template_versions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "prompt_templates"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "human_review_decisions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_node_runs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_runs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_template_versions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_templates"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "assets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "task_versions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tasks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
