import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPromptVersionName1700000000004 implements MigrationInterface {
  name = 'AddPromptVersionName1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "prompt_template_versions" ADD COLUMN "name" varchar(120)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "prompt_template_versions" DROP COLUMN "name"`);
  }
}
