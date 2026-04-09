-- Run against the AUTH database after 001_auth_rbac_mysql.sql.
-- Adds financial.read so management can grant/revoke balance & monetary data access per role.

INSERT IGNORE INTO `rbac_permissions` (`permission_key`, `description`, `date_created`) VALUES
('financial.read', 'View wallet balances, transaction amounts, settlement totals, and monetary dashboard metrics', NOW());

INSERT IGNORE INTO `rbac_role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `rbac_roles` r, `rbac_permissions` p
WHERE r.slug IN ('finance', 'operations', 'ops_support', 'compliance', 'growth')
  AND p.permission_key = 'financial.read';
