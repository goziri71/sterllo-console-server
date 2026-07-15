-- Run against the AUTH database (same as AUTH_DB_NAME / Users table).
-- Adds biller_id for Redbiller crosslink login user matching.

ALTER TABLE `Users`
  ADD COLUMN `biller_id` VARCHAR(255) NULL AFTER `email`,
  ADD UNIQUE KEY `users_biller_id_uq` (`biller_id`);
