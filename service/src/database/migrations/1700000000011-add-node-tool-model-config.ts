import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add modelConfigJson column to node_tools for per-model extra params.
 */
export class AddNodeToolModelConfig1700000000011 implements MigrationInterface {
  name = 'AddNodeToolModelConfig1700000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE node_tools ADD COLUMN modelConfigJson TEXT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SQLite cannot drop columns easily; no-op rollback.
  }
}
