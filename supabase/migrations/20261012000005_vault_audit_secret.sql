-- ============================================================================
-- Medi Connect AI — Vault-Backed Audit HMAC Secret Migration
-- Migration: 20261012000005_vault_audit_secret.sql
-- Description: Generates audit secret inside Supabase Vault and rewrites
--              hash_audit_identifier to read from vault.decrypted_secrets.
-- ============================================================================

-- 1. Create or ensure audit_hmac_secret exists in Supabase Vault
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'audit_hmac_secret') THEN
        PERFORM vault.create_secret(
            encode(extensions.gen_random_bytes(32), 'hex'),
            'audit_hmac_secret',
            'HMAC-SHA256 secret key for audit log hashing'
        );
    END IF;
END $$;

-- 2. Ensure vault schema is strictly inaccessible to client roles (anon, authenticated)
REVOKE ALL ON SCHEMA vault FROM anon, authenticated, public;
REVOKE ALL ON ALL TABLES IN SCHEMA vault FROM anon, authenticated, public;
REVOKE ALL ON ALL ROUTINES IN SCHEMA vault FROM anon, authenticated, public;

-- 3. Rewrite hash_audit_identifier() to read from Vault securely
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
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'audit_hmac_secret'
    LIMIT 1;

    IF v_secret IS NULL THEN
        RAISE EXCEPTION 'CONFIGURATION ERROR: Vault secret audit_hmac_secret is missing. Audit logging cannot proceed.';
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

-- 4. Grant execute permission to authenticated users for audit logging
GRANT EXECUTE ON FUNCTION public.hash_audit_identifier(TEXT) TO authenticated;
