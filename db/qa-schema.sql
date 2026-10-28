-- =========================================================
-- Vision Academy — Isolated QA Schema & Coding Stats Tables
-- File: db/qa-schema.sql
-- =========================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create isolated QA Schema
CREATE SCHEMA IF NOT EXISTS qa;

-- 2. Coding Stats Test Runs
CREATE TABLE IF NOT EXISTS qa.coding_stats_test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Student Coding Stats Test Records
CREATE TABLE IF NOT EXISTS qa.student_coding_stats_test (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id UUID NOT NULL REFERENCES qa.coding_stats_test_runs(id) ON DELETE CASCADE,
    student_id VARCHAR(64) NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    platform VARCHAR(32) NOT NULL CHECK (platform IN ('leetcode', 'hackerrank')),
    easy_count INT NOT NULL DEFAULT 0 CHECK (easy_count >= 0),
    medium_count INT NOT NULL DEFAULT 0 CHECK (medium_count >= 0),
    hard_count INT NOT NULL DEFAULT 0 CHECK (hard_count >= 0),
    total_problems INT NOT NULL DEFAULT 0 CHECK (total_problems >= 0),
    contest_rating INT NOT NULL DEFAULT 0 CHECK (contest_rating >= 0),
    streak_days INT NOT NULL DEFAULT 0 CHECK (streak_days >= 0),
    data_source VARCHAR(32) NOT NULL DEFAULT 'mock' CHECK (data_source = 'mock'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_qa_test_student_platform UNIQUE (test_run_id, student_id, platform)
);

-- 4. Indexes for student, test-run, and creation queries
CREATE INDEX IF NOT EXISTS idx_qa_test_runs_created_at ON qa.coding_stats_test_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_coding_stats_test_run ON qa.student_coding_stats_test(test_run_id);
CREATE INDEX IF NOT EXISTS idx_qa_coding_stats_student ON qa.student_coding_stats_test(student_id);
