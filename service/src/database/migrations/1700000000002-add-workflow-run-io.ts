import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkflowRunIo1700000000002 implements MigrationInterface {
  name = 'AddWorkflowRunIo1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "workflow_runs" ADD COLUMN "inputJson" text`);
    await queryRunner.query(`ALTER TABLE "workflow_runs" ADD COLUMN "outputJson" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "workflow_runs" DROP COLUMN "outputJson"`);
    await queryRunner.query(`ALTER TABLE "workflow_runs" DROP COLUMN "inputJson"`);
  }
}
