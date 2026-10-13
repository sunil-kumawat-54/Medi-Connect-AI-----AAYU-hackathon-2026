# Medi Connect AI — Setup & Configuration Guide

> **Document Status**: Production Setup Reference  
> **Target Project**: Supabase (`nbwggyzxivengzfnarin.supabase.co`)  
> **Security Baseline**: RLS on all tables, isolated private schema for HMAC secrets, zero service keys in client bundles.

---

## 1. Required Manual Supabase Dashboard Settings

The following security and authentication settings cannot be configured via standard SQL migrations and must be toggled in the Supabase Management Console:

### (a) Leaked Password Protection (HaveIBeenPwned)
* **Location**: **Dashboard -> Authentication -> Password Protection**
* **Setting**: Enable **"Check for leaked passwords"**
* **Rationale**: Flags and rejects passwords that appear in public data breaches (HaveIBeenPwned.org API). Directly resolves the security advisor advisory (`auth_leaked_password_protection`).

### (b) Email Confirmation Behavior
* **Location**: **Dashboard -> Authentication -> Providers -> Email**
* **Setting**: **"Confirm email"**
* **Hackathon Demo Recommendation**: 
  - For hackathon live testing and automated onboarding, toggle **OFF** ("Confirm email: disabled") or leave enabled only if Supabase SMTP / Inbucket email capture is monitored.
  - All 5 synthetic demo users are pre-confirmed with non-empty tokens in `auth.users`.

### (c) Allowed Redirect URLs & Deep Linking
* **Location**: **Dashboard -> Authentication -> URL Configuration**
* **Site URL**: `http://localhost:5173`
* **Redirect URLs**:
  - `http://localhost:5173/**` (Web Vite dev & preview)
  - `exp://localhost:8081/**` (Expo dev server)
  - `com.mediconnect.ai://**` (Mobile deep link schema)

---

## 2. Secrets Storage Architecture

### Why `private.app_secrets` is used instead of Supabase Vault
* **Managed Vault Restriction**: When calling `vault.create_secret` on this Supabase project, managed PostgreSQL user `postgres` was denied execution permissions on internal `pgsodium` nonce-generation routines (`permission denied for function _crypto_aead_det_noncegen`).
* **Implementation Strategy**:
  - In accordance with project security requirements, the HMAC audit secret was moved to an isolated private schema table: `private.app_secrets`.
  - **Permissions**: `REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;` and `REVOKE ALL ON TABLE private.app_secrets FROM PUBLIC, anon, authenticated;`.
  - **RLS**: Row-level security is explicitly enabled with zero client policies.
  - **Access Model**: The audit hashing function `public.hash_audit_identifier()` executes as `SECURITY DEFINER` with `SET search_path = ''` and fully-qualified references, reading from `private.app_secrets` directly in PostgreSQL memory without ever exposing secret values to PostgREST, REST clients, or logs.

---

## 3. Environment Configuration

### Client Environment Variables (Zero Secret Quarantine)
* **Web (`apps/web/.env`)**:
  ```ini
  VITE_SUPABASE_URL=https://nbwggyzxivengzfnarin.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5id2dneXp4aXZlbmd6Zm5hcmluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3Mzc2MjcsImV4cCI6MjEwNzMxMzYyN30.TmDFV5AXkyNIyLPIsjgFqSQxwbIXGfs5pZRb70ZZBiY
  ```
* **Mobile (`apps/mobile/.env`)**:
  ```ini
  EXPO_PUBLIC_SUPABASE_URL=https://nbwggyzxivengzfnarin.supabase.co
  EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5id2dneXp4aXZlbmd6Zm5hcmluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3Mzc2MjcsImV4cCI6MjEwNzMxMzYyN30.TmDFV5AXkyNIyLPIsjgFqSQxwbIXGfs5pZRb70ZZBiY
  ```
* **Demo Passwords**:
  - Saved exclusively in `.demo_secret.txt` (strictly gitignored, verified via `git check-ignore -v .demo_secret.txt`).
  - Never committed to git, never bundled in web or mobile distributions, and injected only inside administrative seed transactions via `SET LOCAL app.settings.demo_password`.

---

## 4. Verification Procedures

### (a) Run RLS Automated Test Suite
From Supabase SQL editor or psql:
```sql
SELECT test_num, test_name, acting_role, status, detail 
FROM tests.run_rls_test_suite() 
ORDER BY test_num;
```
Expected: 11 / 11 tests PASS with non-trivial seeded data.

### (b) Verify Demo User Authentication
From project root:
```bash
node scratch/test_auth.mjs
```
Expected: All 5 demo users authenticate via Supabase Auth and return expected profile and JWT role claims.

### (c) Build & Scan Production Artifacts
```bash
# Web
pnpm --filter @medi-connect/web build
Get-ChildItem -Path apps/web/dist -Recurse -File | Select-String -Pattern "service_role", "sb_secret_"

# Mobile
pnpm --filter @medi-connect/mobile typecheck
npx expo export --platform android --output-dir dist
```
