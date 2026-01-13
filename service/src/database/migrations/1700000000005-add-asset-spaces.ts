import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAssetSpaces1700000000005 implements MigrationInterface {
  name = 'AddAssetSpaces1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "asset_spaces" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" varchar(120) NOT NULL,
        "description" text,
        "userId" int NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_asset_spaces_userId" ON "asset_spaces" ("userId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "assets_temp" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "taskId" int,
        "spaceId" int,
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
        FOREIGN KEY ("spaceId") REFERENCES "asset_spaces" ("id") ON DELETE SET NULL,
        FOREIGN KEY ("versionId") REFERENCES "task_versions" ("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      INSERT INTO "assets_temp" (
        "id",
        "taskId",
        "versionId",
        "type",
        "status",
        "url",
        "filename",
        "filesize",
        "mimeType",
        "metadataJson",
        "replacedById",
        "trashedAt",
        "createdAt",
        "updatedAt"
      )
      SELECT
        "id",
        "taskId",
        "versionId",
        "type",
        "status",
        "url",
        "filename",
        "filesize",
        "mimeType",
        "metadataJson",
        "replacedById",
        "trashedAt",
        "createdAt",
        "updatedAt"
      FROM "assets"
    `);

    await queryRunner.query(`DROP TABLE "assets"`);
    await queryRunner.query(`ALTER TABLE "assets_temp" RENAME TO "assets"`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_assets_taskId" ON "assets" ("taskId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_assets_spaceId" ON "assets" ("spaceId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_assets_versionId" ON "assets" ("versionId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_assets_type" ON "assets" ("type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_assets_status" ON "assets" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "assets_temp" (
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

    await queryRunner.query(`
      INSERT INTO "assets_temp" (
        "id",
        "taskId",
        "versionId",
        "type",
        "status",
        "url",
        "filename",
        "filesize",
        "mimeType",
        "metadataJson",
        "replacedById",
        "trashedAt",
        "createdAt",
        "updatedAt"
      )
      SELECT
        "id",
        "taskId",
        "versionId",
        "type",
        "status",
        "url",
        "filename",
        "filesize",
        "mimeType",
        "metadataJson",
        "replacedById",
        "trashedAt",
        "createdAt",
        "updatedAt"
      FROM "assets"
      WHERE "taskId" IS NOT NULL
    `);

    await queryRunner.query(`DROP TABLE "assets"`);
    await queryRunner.query(`ALTER TABLE "assets_temp" RENAME TO "assets"`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_assets_taskId" ON "assets" ("taskId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_assets_versionId" ON "assets" ("versionId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_assets_type" ON "assets" ("type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_assets_status" ON "assets" ("status")`);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_asset_spaces_userId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "asset_spaces"`);
  }
}
