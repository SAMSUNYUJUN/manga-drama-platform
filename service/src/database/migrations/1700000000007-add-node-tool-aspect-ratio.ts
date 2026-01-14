import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNodeToolAspectRatio1700000000007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE node_tools ADD COLUMN imageAspectRatio VARCHAR(20) DEFAULT '16:9'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SQLite doesn't support DROP COLUMN directly; skip rollback
  }
}
