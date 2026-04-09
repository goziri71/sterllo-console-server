-- Run against the AUTH database (same as AUTH_DB_NAME / Users table).
-- Creates RBAC tables and seeds permissions, system roles, and role-permission links.
--
-- No FOREIGN KEY constraints: many app DB users lack REFERENCES privilege on parent
-- tables (error 1142). Integrity is enforced in application code.
--
-- Use utf8mb4_0900_ai_ci (MySQL 8 default) so joins to existing `Users.role` do not hit
-- ER_CANT_AGGREGATE_2COLLATIONS (mix with utf8mb4_unicode_ci).

CREATE TABLE IF NOT EXISTS `rbac_permissions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `permission_key` VARCHAR(120) NOT NULL,
  `description` VARCHAR(255) NULL,
  `date_created` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rbac_permissions_key_uq` (`permission_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `rbac_roles` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `slug` VARCHAR(100) NOT NULL,
  `label` VARCHAR(150) NOT NULL,
  `is_system` TINYINT NOT NULL DEFAULT 0,
  `date_created` DATETIME NULL,
  `date_modified` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rbac_roles_slug_uq` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `rbac_role_permissions` (
  `role_id` INT NOT NULL,
  `permission_id` INT NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`),
  KEY `rbac_rp_permission_id_idx` (`permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `rbac_user_roles` (
  `user_id` INT NOT NULL,
  `role_id` INT NOT NULL,
  `assigned_at` DATETIME NOT NULL,
  `assigned_by_user_id` INT NULL,
  PRIMARY KEY (`user_id`, `role_id`),
  KEY `rbac_ur_role_id_idx` (`role_id`),
  KEY `rbac_ur_assigner_idx` (`assigned_by_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO `rbac_permissions` (`permission_key`, `description`, `date_created`) VALUES
('*', 'Full access (management)', NOW()),
('rbac.manage', 'Create roles, set permissions, assign users', NOW()),
('console.read', 'Read console data (list/detail endpoints)', NOW()),
('customer.update', 'Update customers', NOW()),
('merchant.update', 'Update merchants', NOW()),
('kyc.update', 'Update KYC records', NOW()),
('dispute.update', 'Update disputes', NOW()),
('overdraft.update', 'Update overdraft requests', NOW()),
('config.whitelist.update', 'Update IP whitelist', NOW());

INSERT IGNORE INTO `rbac_roles` (`slug`, `label`, `is_system`, `date_created`) VALUES
('management', 'Management', 1, NOW()),
('finance', 'Finance', 1, NOW()),
('operations', 'Operations', 1, NOW()),
('ops_support', 'Ops support', 1, NOW()),
('compliance', 'Compliance', 1, NOW()),
('growth', 'Growth', 1, NOW());

-- management: *
INSERT IGNORE INTO `rbac_role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `rbac_roles` r, `rbac_permissions` p
WHERE r.slug = 'management' AND p.permission_key = '*';

-- finance: read
INSERT IGNORE INTO `rbac_role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `rbac_roles` r, `rbac_permissions` p
WHERE r.slug = 'finance' AND p.permission_key = 'console.read';

-- operations: read + updates (per former UPDATE_ROLES / route matrix)
INSERT IGNORE INTO `rbac_role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `rbac_roles` r, `rbac_permissions` p
WHERE r.slug = 'operations' AND p.permission_key IN (
  'console.read', 'dispute.update', 'overdraft.update', 'merchant.update', 'customer.update', 'config.whitelist.update'
);

-- ops_support: read
INSERT IGNORE INTO `rbac_role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `rbac_roles` r, `rbac_permissions` p
WHERE r.slug = 'ops_support' AND p.permission_key = 'console.read';

-- compliance: read + kyc/dispute/merchant/customer/config whitelist
INSERT IGNORE INTO `rbac_role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `rbac_roles` r, `rbac_permissions` p
WHERE r.slug = 'compliance' AND p.permission_key IN (
  'console.read', 'kyc.update', 'dispute.update', 'merchant.update', 'customer.update', 'config.whitelist.update'
);

-- growth: read
INSERT IGNORE INTO `rbac_role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `rbac_roles` r, `rbac_permissions` p
WHERE r.slug = 'growth' AND p.permission_key = 'console.read';

-- Backfill: one row per (user, role) from legacy Users.role when slug exists
INSERT IGNORE INTO `rbac_user_roles` (`user_id`, `role_id`, `assigned_at`, `assigned_by_user_id`)
SELECT u.id, r.id, NOW(), NULL
FROM `Users` u
INNER JOIN `rbac_roles` r
  ON r.slug COLLATE utf8mb4_0900_ai_ci = u.role COLLATE utf8mb4_0900_ai_ci
WHERE u.role IS NOT NULL AND TRIM(u.role) <> '' AND u.role NOT IN ('user', 'pending');
