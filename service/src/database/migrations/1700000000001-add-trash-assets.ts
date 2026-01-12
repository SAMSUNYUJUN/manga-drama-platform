import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTrashAssets1700000000001 implements MigrationInterface {
  name = 'AddTrashAssets1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "trash_assets" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "assetId" integer,
        "originRunId" integer,
        "originNodeId" varchar(64),
        "metadataJson" text,
        "expireAt" datetime NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_trash_assets_expireAt" ON "trash_assets" ("expireAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_trash_assets_expireAt"`);
    await queryRunner.query(`DROP TABLE "trash_assets"`);
  }
}
