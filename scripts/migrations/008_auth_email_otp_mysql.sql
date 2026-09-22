-- Run against the AUTH database (AUTH_DB_NAME).
-- Email OTP login challenges (passwordless first factor).

CREATE TABLE IF NOT EXISTS `auth_email_otps` (
  `id` VARCHAR(36) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `user_id` INT NULL,
  `code_hash` VARCHAR(64) NOT NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `max_attempts` INT NOT NULL DEFAULT 5,
  `expires_at` DATETIME NOT NULL,
  `consumed_at` DATETIME NULL,
  `ip_address` VARCHAR(64) NULL,
  `date_created` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `auth_email_otp_email_idx` (`email`),
  KEY `auth_email_otp_expiry_idx` (`expires_at`),
  KEY `auth_email_otp_user_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
