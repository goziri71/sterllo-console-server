-- Run against the AUTH database (same as AUTH_DB_NAME / Users table).
-- Console users are provisioned locally but authenticate through Crosslink only.

ALTER TABLE `Users`
  MODIFY COLUMN `password` VARCHAR(255) NULL;

SET @has_auth_provider := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Users'
    AND COLUMN_NAME = 'auth_provider'
);
SET @add_auth_provider := IF(
  @has_auth_provider = 0,
  'ALTER TABLE `Users` ADD COLUMN `auth_provider` VARCHAR(30) NOT NULL DEFAULT ''crosslink'' AFTER `biller_id`',
  'SELECT 1'
);
PREPARE add_auth_provider_stmt FROM @add_auth_provider;
EXECUTE add_auth_provider_stmt;
DEALLOCATE PREPARE add_auth_provider_stmt;

UPDATE `Users`
SET `auth_provider` = 'crosslink'
WHERE `auth_provider` IS NULL OR `auth_provider` <> 'crosslink';
