import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNodeToolLlmParams1700000000008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add systemPromptVersionId column for LLM system prompt
    await queryRunner.query(`
      ALTER TABLE node_tools ADD COLUMN systemPromptVersionId INTEGER
    `);

    // Add maxTokens column with default 1000
    await queryRunner.query(`
      ALTER TABLE node_tools ADD COLUMN maxTokens INTEGER DEFAULT 1000
    `);

    // Add temperature column with default 0.7
    await queryRunner.query(`
      ALTER TABLE node_tools ADD COLUMN temperature REAL DEFAULT 0.7
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SQLite doesn't support DROP COLUMN directly; skip rollback
  }
}
