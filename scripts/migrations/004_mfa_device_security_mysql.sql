-- Run against the AUTH database (same as AUTH_DB_NAME / Users table).
-- MFA, recovery, short-lived login challenges, single-device sessions, and audit events.

CREATE TABLE IF NOT EXISTS `auth_mfa_factors` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `factor_type` VARCHAR(30) NOT NULL DEFAULT 'totp',
  `secret_ciphertext` VARCHAR(1024) NOT NULL,
  `secret_iv` VARCHAR(32) NOT NULL,
  `secret_tag` VARCHAR(32) NOT NULL,
  `is_enabled` TINYINT NOT NULL DEFAULT 0,
  `last_used_step` BIGINT NULL,
  `enrolled_at` DATETIME NULL,
  `date_created` DATETIME NOT NULL,
  `date_modified` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_mfa_factor_user_uq` (`user_id`),
  KEY `auth_mfa_factor_enabled_idx` (`is_enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `auth_mfa_recovery_codes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `code_hash` VARCHAR(64) NOT NULL,
  `used_at` DATETIME NULL,
  `date_created` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_mfa_recovery_code_hash_uq` (`code_hash`),
  KEY `auth_mfa_recovery_user_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `auth_login_challenges` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` INT NOT NULL,
  `purpose` VARCHAR(30) NOT NULL,
  `token_hash` VARCHAR(64) NOT NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `max_attempts` INT NOT NULL DEFAULT 5,
  `expires_at` DATETIME NOT NULL,
  `consumed_at` DATETIME NULL,
  `context_json` TEXT NULL,
  `date_created` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_login_challenge_token_uq` (`token_hash`),
  KEY `auth_login_challenge_user_idx` (`user_id`),
  KEY `auth_login_challenge_expiry_idx` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `auth_sessions` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` INT NOT NULL,
  `auth_method` VARCHAR(30) NOT NULL,
  `mfa_verified_at` DATETIME NOT NULL,
  `ip_address` VARCHAR(64) NULL,
  `user_agent` VARCHAR(512) NULL,
  `device_label` VARCHAR(150) NULL,
  `last_seen_at` DATETIME NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `is_active` TINYINT NULL DEFAULT 1,
  `revoked_at` DATETIME NULL,
  `revoke_reason` VARCHAR(100) NULL,
  `date_created` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_session_one_active_user_uq` (`user_id`, `is_active`),
  KEY `auth_session_user_idx` (`user_id`),
  KEY `auth_session_active_idx` (`user_id`, `revoked_at`, `expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Upgrade databases where this migration was previously run before the
-- one-active-session uniqueness guard was introduced.
SET @has_is_active := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'auth_sessions'
    AND COLUMN_NAME = 'is_active'
);
SET @add_is_active := IF(
  @has_is_active = 0,
  'ALTER TABLE `auth_sessions` ADD COLUMN `is_active` TINYINT NULL DEFAULT 1 AFTER `expires_at`',
  'SELECT 1'
);
PREPARE add_is_active_stmt FROM @add_is_active;
EXECUTE add_is_active_stmt;
DEALLOCATE PREPARE add_is_active_stmt;

UPDATE `auth_sessions`
SET `is_active` = IF(`revoked_at` IS NULL AND `expires_at` > NOW(), 1, NULL);

SET @has_active_unique := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'auth_sessions'
    AND INDEX_NAME = 'auth_session_one_active_user_uq'
);
SET @add_active_unique := IF(
  @has_active_unique = 0,
  'ALTER TABLE `auth_sessions` ADD UNIQUE KEY `auth_session_one_active_user_uq` (`user_id`, `is_active`)',
  'SELECT 1'
);
PREPARE add_active_unique_stmt FROM @add_active_unique;
EXECUTE add_active_unique_stmt;
DEALLOCATE PREPARE add_active_unique_stmt;

CREATE TABLE IF NOT EXISTS `auth_security_events` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` INT NULL,
  `session_id` VARCHAR(36) NULL,
  `event_type` VARCHAR(80) NOT NULL,
  `ip_address` VARCHAR(64) NULL,
  `user_agent` VARCHAR(512) NULL,
  `metadata_json` TEXT NULL,
  `date_created` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `auth_security_event_user_idx` (`user_id`),
  KEY `auth_security_event_type_idx` (`event_type`),
  KEY `auth_security_event_date_idx` (`date_created`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
