-- ============================================================================
-- Medi Connect AI — Private Schema Audit Secret Storage Migration
-- Migration: 20261012000005_private_audit_secret.sql
-- Description: Creates isolated private.app_secrets table with zero grants
--              to anon/authenticated and RLS enabled, and points hash_audit_identifier to it.
-- ============================================================================

-- 1. Create isolated private schema
CREATE SCHEMA IF NOT EXISTS private;

-- 2. Strictly revoke all schema access from client roles
REVOKE ALL ON SCHEMA private FROM anon, authenticated, public;

-- 3. Create app_secrets table in private schema
CREATE TABLE IF NOT EXISTS private.app_secrets (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    secret TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS and grant zero client access
ALTER TABLE private.app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.app_secrets FROM anon, authenticated, public;

-- 4. Securely generate audit secret inside database (never printed/logged)
INSERT INTO private.app_secrets (name, secret)
VALUES ('audit_hmac_secret', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

-- 5. Rewrite hash_audit_identifier() to read from private.app_secrets
CREATE OR REPLACE FUNCTION public.hash_audit_identifier(p_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_secret TEXT;
BEGIN
    SELECT secret INTO v_secret
    FROM private.app_secrets
    WHERE name = 'audit_hmac_secret'
    LIMIT 1;

    IF v_secret IS NULL THEN
        RAISE EXCEPTION 'CONFIGURATION ERROR: Secret audit_hmac_secret is missing in private.app_secrets. Audit logging cannot proceed.';
    END IF;

    RETURN encode(
        extensions.hmac(
            p_input::bytea,
            v_secret::bytea,
            'sha256'
        ),
        'hex'
    );
END;
$$;

-- 6. Grant execute permission on hash function to authenticated users
GRANT EXECUTE ON FUNCTION public.hash_audit_identifier(TEXT) TO authenticated;
