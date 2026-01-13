import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkflowTemplateSpace1700000000006 implements MigrationInterface {
  name = 'AddWorkflowTemplateSpace1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "workflow_templates_temp" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" varchar(120) NOT NULL,
        "description" text,
        "spaceId" int,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY ("spaceId") REFERENCES "asset_spaces" ("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      INSERT INTO "workflow_templates_temp" (
        "id",
        "name",
        "description",
        "createdAt",
        "updatedAt"
      )
      SELECT
        "id",
        "name",
        "description",
        "createdAt",
        "updatedAt"
      FROM "workflow_templates"
    `);

    await queryRunner.query(`DROP TABLE "workflow_templates"`);
    await queryRunner.query(`ALTER TABLE "workflow_templates_temp" RENAME TO "workflow_templates"`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_workflow_templates_spaceId" ON "workflow_templates" ("spaceId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "workflow_templates_temp" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" varchar(120) NOT NULL,
        "description" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await queryRunner.query(`
      INSERT INTO "workflow_templates_temp" (
        "id",
        "name",
        "description",
        "createdAt",
        "updatedAt"
      )
      SELECT
        "id",
        "name",
        "description",
        "createdAt",
        "updatedAt"
      FROM "workflow_templates"
    `);

    await queryRunner.query(`DROP TABLE "workflow_templates"`);
    await queryRunner.query(`ALTER TABLE "workflow_templates_temp" RENAME TO "workflow_templates"`);
  }
}
