-- Root cause fix: order_disputes had RLS policies but no SELECT/INSERT grants
-- for authenticated. Disputes were inserted via SECURITY DEFINER RPC, so open
-- worked, but customer/provider/admin clients could not read dispute rows.
-- That made OrderDisputeDetails disappear after refresh while revision feedback
-- (from messages) still rendered.

GRANT SELECT ON TABLE order_disputes TO authenticated;
GRANT SELECT ON TABLE order_disputes TO service_role;

-- Fallback app-level insert path (RPC remains primary).
GRANT INSERT ON TABLE order_disputes TO authenticated;

-- Resolution updates stay service_role-only (reason remains immutable via trigger).
GRANT UPDATE ON TABLE order_disputes TO service_role;

-- Tighten accidental wide grants from earlier defaults.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE order_disputes FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE order_disputes FROM authenticated;
REVOKE UPDATE, DELETE ON TABLE order_disputes FROM anon;
REVOKE UPDATE, DELETE ON TABLE order_disputes FROM authenticated;
