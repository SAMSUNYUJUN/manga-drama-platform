import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNodeTools1700000000003 implements MigrationInterface {
  name = 'AddNodeTools1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "node_tools" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" varchar(120) NOT NULL,
        "description" text,
        "promptTemplateVersionId" integer,
        "model" varchar(120),
        "inputsJson" text NOT NULL,
        "outputsJson" text NOT NULL,
        "enabled" boolean NOT NULL DEFAULT (1),
        "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "node_tools"`);
  }
}
