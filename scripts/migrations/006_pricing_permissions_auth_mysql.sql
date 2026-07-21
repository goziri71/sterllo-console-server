-- Run against the AUTH database only.
-- Adds pricing-specific read and management permissions.

INSERT IGNORE INTO `rbac_permissions` (`permission_key`, `description`, `date_created`) VALUES
('pricing.read', 'View default, merchant custom, and effective pricing', NOW()),
('pricing.manage', 'Create, update, disable, and delete pricing configurations', NOW());

INSERT IGNORE INTO `rbac_role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `rbac_roles` r, `rbac_permissions` p
WHERE r.slug IN ('finance', 'operations', 'ops_support', 'compliance', 'growth')
  AND p.permission_key = 'pricing.read';

CREATE TABLE IF NOT EXISTS `PricingFeeAuditEvents` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `actor_user_id` INT NOT NULL,
  `actor_user_key` VARCHAR(600) NOT NULL,
  `actor_session_id` VARCHAR(36) NOT NULL,
  `action` VARCHAR(20) NOT NULL,
  `scope` VARCHAR(20) NOT NULL,
  `fee_type` VARCHAR(40) NOT NULL,
  `fee_row_id` INT NULL,
  `merchant_user_key` VARCHAR(30) NULL,
  `account_key` VARCHAR(30) NULL,
  `before_json` LONGTEXT NULL,
  `after_json` LONGTEXT NULL,
  `ip_address` VARCHAR(64) NULL,
  `user_agent` VARCHAR(512) NULL,
  `date_created` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `pricing_audit_actor_idx` (`actor_user_id`),
  KEY `pricing_audit_actor_key_idx` (`actor_user_key`),
  KEY `pricing_audit_merchant_idx` (`account_key`),
  KEY `pricing_audit_type_idx` (`fee_type`),
  KEY `pricing_audit_date_idx` (`date_created`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
