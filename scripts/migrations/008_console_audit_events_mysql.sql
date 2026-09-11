-- Run against the AUTH database (same as AUTH_DB_NAME / Users / MFA tables).
-- Live command-center audit trail for console team actions.

CREATE TABLE IF NOT EXISTS `console_audit_events` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `event_type` VARCHAR(64) NOT NULL,
  `outcome` VARCHAR(20) NOT NULL DEFAULT 'success',
  `actor_user_id` INT NULL,
  `actor_user_key` VARCHAR(128) NULL,
  `actor_email` VARCHAR(255) NULL,
  `actor_role` VARCHAR(64) NULL,
  `actor_name` VARCHAR(255) NULL,
  `session_id` VARCHAR(64) NULL,
  `target_type` VARCHAR(64) NULL,
  `target_key` VARCHAR(255) NULL,
  `account_key` VARCHAR(128) NULL,
  `reference` VARCHAR(255) NULL,
  `summary` VARCHAR(512) NOT NULL,
  `metadata_json` TEXT NULL,
  `ip_address` VARCHAR(64) NULL,
  `user_agent` VARCHAR(512) NULL,
  `date_created` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `console_audit_created_idx` (`date_created`),
  KEY `console_audit_type_idx` (`event_type`),
  KEY `console_audit_actor_idx` (`actor_user_id`),
  KEY `console_audit_account_idx` (`account_key`),
  KEY `console_audit_reference_idx` (`reference`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
