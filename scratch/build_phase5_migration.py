import re

v3_path = r"u:\aayu\supabase\tests\run_rls_test_suite_v3.sql"
m2_path = r"u:\aayu\supabase\migrations\20261013000002_phase5_doctor_approval_and_rls_hardening.sql"

with open(v3_path, "r", encoding="utf-8") as f:
    v3_content = f.read()

with open(m2_path, "r", encoding="utf-8") as f:
    m2_content = f.read()

# We extract tests.run_rls_test_suite from v3
start_marker = "CREATE OR REPLACE FUNCTION tests.run_rls_test_suite()"
idx_start = v3_content.find(start_marker)
suite_body = v3_content[idx_start:]

# New tests 52-63
new_tests = """
    -- ========================================================================
    -- PHASE 5 NEW RLS AND SECURITY TESTS (Tests 52 - 63)
    -- ========================================================================

    -- 52. Client (Patient A) cannot INSERT biomarkers
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        INSERT INTO public.biomarkers (
            report_id, patient_id, name, raw_value, numeric_value, unit, severity
        ) VALUES (
            'f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
            'Malicious Glucose', '999', 999, 'mg/dL', 'NORMAL'::public.biomarker_severity
        );
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN
            v_err_caught := TRUE;
            v_err_msg := 'RLS denied direct INSERT on biomarkers (0 rows affected)';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 52; test_name := 'Phase 5: Patient A cannot directly INSERT into biomarkers'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Direct INSERT rejected by RLS: %s', v_err_msg);
    RETURN NEXT;

    -- 53. Client (Doctor Alex) cannot direct INSERT biomarkers
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        INSERT INTO public.biomarkers (
            report_id, patient_id, name, raw_value, numeric_value, unit, severity
        ) VALUES (
            'f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
            'Doctor Direct Biomarker', '500', 500, 'mg/dL', 'NORMAL'::public.biomarker_severity
        );
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN
            v_err_caught := TRUE;
            v_err_msg := 'RLS denied doctor direct INSERT on biomarkers (0 rows affected)';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 53; test_name := 'Phase 5: Doctor Alex cannot directly INSERT into biomarkers'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Doctor direct INSERT rejected: %s', v_err_msg);
    RETURN NEXT;

    -- 54. Client (Patient A) cannot INSERT ai_summaries
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        INSERT INTO public.ai_summaries (
            report_id, patient_id, version, summary_type, content_markdown, review_status
        ) VALUES (
            'f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
            2, 'PATIENT_PLAIN_LANGUAGE'::public.summary_type, 'Forged Summary', 'APPROVED'::public.summary_review_status
        );
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN
            v_err_caught := TRUE;
            v_err_msg := 'RLS denied direct INSERT on ai_summaries (0 rows affected)';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 54; test_name := 'Phase 5: Patient A cannot directly INSERT into ai_summaries'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Direct INSERT rejected by RLS: %s', v_err_msg);
    RETURN NEXT;

    -- 55. Client (Doctor Alex) cannot direct INSERT ai_summaries
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        INSERT INTO public.ai_summaries (
            report_id, patient_id, version, summary_type, content_markdown, review_status
        ) VALUES (
            'f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
            3, 'PATIENT_PLAIN_LANGUAGE'::public.summary_type, 'Doctor Forged Summary', 'APPROVED'::public.summary_review_status
        );
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN
            v_err_caught := TRUE;
            v_err_msg := 'RLS denied doctor direct INSERT on ai_summaries (0 rows affected)';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 55; test_name := 'Phase 5: Doctor Alex cannot directly INSERT into ai_summaries'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Doctor direct summary INSERT rejected: %s', v_err_msg);
    RETURN NEXT;

    -- 56. Client (Patient A) cannot mutate medical_reports.processing_status
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        UPDATE public.medical_reports
        SET processing_status = 'COMPLETED'::public.processing_status
        WHERE id = 'f0000000-0000-0000-0000-000000000001';
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 56; test_name := 'Phase 5: Client direct mutation of processing_status is BLOCKED by trigger'; acting_role := current_user;
    status := CASE WHEN v_err_caught AND v_err_msg LIKE '%PERMISSION DENIED: Direct mutation of processing_status by client roles is strictly prohibited%' THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Trigger blocked mutation: %s', v_err_msg);
    RETURN NEXT;

    -- 57. Client (Patient A) calling record_server_report_extraction is DENIED
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.record_server_report_extraction(
            'f0000000-0000-0000-0000-000000000001',
            '[]'::jsonb,
            '{"content_markdown": "Test"}'::jsonb,
            95.0,
            'COMPLETED'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 57; test_name := 'Phase 5: Client (Patient A) calling record_server_report_extraction is DENIED'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Permission denied: %s', v_err_msg);
    RETURN NEXT;

    -- 58. Client (Doctor Alex) calling record_server_report_extraction is DENIED
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.record_server_report_extraction(
            'f0000000-0000-0000-0000-000000000001',
            '[]'::jsonb,
            '{"content_markdown": "Test"}'::jsonb,
            95.0,
            'COMPLETED'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 58; test_name := 'Phase 5: Client (Doctor Alex) calling record_server_report_extraction is DENIED'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Permission denied: %s', v_err_msg);
    RETURN NEXT;

    -- 59. Positive Control: Patient A reads own patient_rate_limits
    RESET ROLE;
    INSERT INTO public.patient_rate_limits (patient_id, action_type, window_hour, request_count)
    VALUES ('a0000000-0000-0000-0000-000000000001', 'TEST_ACTION', '2026-10-13-11', 2)
    ON CONFLICT (patient_id, action_type, window_hour) DO UPDATE SET request_count = 2;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.patient_rate_limits WHERE patient_id = 'a0000000-0000-0000-0000-000000000001';
    test_num := 59; test_name := 'Phase 5: Patient A reads own patient_rate_limits (Positive Control)'; acting_role := current_user;
    status := CASE WHEN v_count > 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Read %s rate limit records (Self-access permitted)', v_count);
    RETURN NEXT;

    -- 60. Cross-Tenant Denial with Existence Check: Patient A reads Patient B patient_rate_limits
    RESET ROLE;
    INSERT INTO public.patient_rate_limits (patient_id, action_type, window_hour, request_count)
    VALUES ('a0000000-0000-0000-0000-000000000002', 'TEST_ACTION', '2026-10-13-11', 3)
    ON CONFLICT (patient_id, action_type, window_hour) DO UPDATE SET request_count = 3;
    SELECT COUNT(*) INTO v_exists_count FROM public.patient_rate_limits WHERE patient_id = 'a0000000-0000-0000-0000-000000000002';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.patient_rate_limits WHERE patient_id = 'a0000000-0000-0000-0000-000000000002';
    test_num := 60; test_name := 'Phase 5: Patient A attempts reading Patient B patient_rate_limits (DENIED)'; acting_role := current_user;
    status := CASE WHEN v_exists_count = 0 THEN 'INCONCLUSIVE' WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Cross-tenant rate limit read denied (0 rows returned). Patient B rate limits exist: YES (%s)', v_exists_count);
    RETURN NEXT;

    -- 61. Direct mutation block: Patient A cannot direct INSERT/UPDATE into patient_rate_limits
    v_err_caught := FALSE;
    BEGIN
        INSERT INTO public.patient_rate_limits (patient_id, action_type, window_hour, request_count)
        VALUES ('a0000000-0000-0000-0000-000000000002', 'CHAT', '2026-10-13-11', 10);
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 61; test_name := 'Phase 5: Client cannot directly INSERT into patient_rate_limits'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Direct INSERT rejected by RLS: %s', v_err_msg);
    RETURN NEXT;

    -- 62. Patient A cannot call check_and_increment_rate_limit for Patient B
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.check_and_increment_rate_limit('a0000000-0000-0000-0000-000000000002', 'EXTRACTION', 10);
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 62; test_name := 'Phase 5: Patient A cannot call check_and_increment_rate_limit for Patient B (DENIED)'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Impersonation blocked: %s', v_err_msg);
    RETURN NEXT;

    -- 63. Positive Control & Rate Limiter Block: check_and_increment_rate_limit blocks on N+1th request
    -- Reset rate limit row for clean deterministic test
    RESET ROLE;
    DELETE FROM public.patient_rate_limits WHERE action_type = 'RL_TEST_BLOCK';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    DECLARE
        v_n_res JSONB;
        v_n_plus_one_res JSONB;
    BEGIN
        -- Request 1 of 2
        SELECT public.check_and_increment_rate_limit('a0000000-0000-0000-0000-000000000001', 'RL_TEST_BLOCK', 2) INTO v_n_res;
        -- Request 2 of 2 (allowed)
        SELECT public.check_and_increment_rate_limit('a0000000-0000-0000-0000-000000000001', 'RL_TEST_BLOCK', 2) INTO v_n_res;
        -- Request 3 (N+1, must be BLOCKED)
        SELECT public.check_and_increment_rate_limit('a0000000-0000-0000-0000-000000000001', 'RL_TEST_BLOCK', 2) INTO v_n_plus_one_res;

        IF (v_n_res->>'allowed')::boolean = TRUE AND (v_n_plus_one_res->>'allowed')::boolean = FALSE THEN
            v_err_caught := FALSE;
        ELSE
            v_err_caught := TRUE;
            v_err_msg := format('Expected N allowed, N+1 blocked. Got N: %s, N+1: %s', v_n_res, v_n_plus_one_res);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 63; test_name := 'Phase 5: Rate limit strictly blocks the N+1th request (Positive Control & Block)'; acting_role := current_user;
    status := CASE WHEN NOT v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := 'Requests 1..N permitted (allowed=true); Request N+1 strictly blocked (allowed=false)';
    RETURN NEXT;
"""

# Insert new_tests before cleanup
cleanup_marker = "-- ========================================================================\n    -- GUARANTEED ZERO-RESIDUE CLEANUP"
idx_cleanup = suite_body.find(cleanup_marker)
if idx_cleanup == -1:
    cleanup_marker = "-- GUARANTEED ZERO-RESIDUE CLEANUP"
    idx_cleanup = suite_body.find(cleanup_marker)

# In cleanup, also delete test rate limit rows
rate_cleanup = """
    -- Delete rate limit test records
    DELETE FROM public.patient_rate_limits WHERE action_type IN ('TEST_ACTION', 'RL_TEST_BLOCK');
"""

updated_suite = suite_body[:idx_cleanup] + new_tests + "\n    " + suite_body[idx_cleanup:]
# Insert rate_cleanup after SET LOCAL app.test_cleanup = 'true';
updated_suite = updated_suite.replace("SET LOCAL app.test_cleanup = 'true';", "SET LOCAL app.test_cleanup = 'true';" + rate_cleanup)

# Update approval rule in test 47 / earlier if needed:
# Test 46 previously verified CRITICAL or ELEVATED. In Phase 5, verification is required for CRITICAL only.
# Test 47 passes with CRITICAL verified.

full_migration = m2_content + "\n\n" + updated_suite

with open(m2_path, "w", encoding="utf-8") as f:
    f.write(full_migration)

print(f"Migration 20261013000002 created successfully. Total length: {len(full_migration)} characters.")
