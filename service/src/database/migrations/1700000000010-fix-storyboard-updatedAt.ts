import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixStoryboardUpdatedAt1700000000010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add triggers to keep updatedAt in sync (sqlite)
    await queryRunner.query(`
      CREATE TRIGGER IF NOT EXISTS trg_storyboard_shots_updated
      AFTER UPDATE ON storyboard_shots
      BEGIN
        UPDATE storyboard_shots SET updatedAt = datetime('now') WHERE id = NEW.id;
      END;
    `);

    await queryRunner.query(`
      CREATE TRIGGER IF NOT EXISTS trg_storyboard_messages_updated
      AFTER UPDATE ON storyboard_messages
      BEGIN
        UPDATE storyboard_messages SET updatedAt = datetime('now') WHERE id = NEW.id;
      END;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_storyboard_shots_updated`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_storyboard_messages_updated`);
  }
}
