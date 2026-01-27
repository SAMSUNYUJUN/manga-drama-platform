import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStoryboard1700000000009 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS storyboard_shots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title VARCHAR(200) NOT NULL,
        spaceId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        createdAt DATETIME DEFAULT (datetime('now')),
        updatedAt DATETIME DEFAULT (datetime('now'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS storyboard_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shotId INTEGER NOT NULL,
        model VARCHAR(120) NOT NULL,
        prompt TEXT NOT NULL,
        inputImagesJson TEXT,
        mediaUrlsJson TEXT,
        status VARCHAR(20) DEFAULT 'completed',
        durationMs INTEGER,
        error TEXT,
        createdAt DATETIME DEFAULT (datetime('now')),
        updatedAt DATETIME DEFAULT (datetime('now')),
        CONSTRAINT fk_storyboard_shot FOREIGN KEY (shotId) REFERENCES storyboard_shots(id) ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS storyboard_messages`);
    await queryRunner.query(`DROP TABLE IF EXISTS storyboard_shots`);
  }
}
