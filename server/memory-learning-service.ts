/**
 * server/memory-learning-service.ts
 * ---------------------------------
 * Persistent Memory and Controlled Learning Pipeline for Vission Academy.
 *
 * Persists and retrieves structured facts in PostgreSQL:
 * - Student facts, progress summaries, approved rubrics, grading policies, and system rules.
 * - Distinguishes verified facts, self-reported claims, interpretations, and preferences.
 * - Feedback collection, reviewer approval, versioned datasets, and benchmark promotion.
 */

import { query, id, logActivity } from './db.js';

export type MemoryCategory = 'student_fact' | 'progress_summary' | 'approved_rubric' | 'grading_policy' | 'system_rule';
export type MemoryEntityType = 'student' | 'class' | 'subject' | 'role' | 'global';
export type MemoryProvenance = 'verified_fact' | 'self_reported' | 'teacher_approved' | 'system_calculated';

export interface PersistentMemoryRecord {
  id: string;
  category: MemoryCategory;
  entityType: MemoryEntityType;
  entityId: string | null;
  memoryKey: string;
  content: Record<string, any>;
  provenance: MemoryProvenance;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiFeedbackRecord {
  id: string;
  userId: string | null;
  role: string;
  queryText: string;
  responseText: string;
  rating: 'helpful' | 'unhelpful' | 'inaccurate' | 'flagged';
  feedbackComment?: string | null;
  failureCategory?: string | null;
  verifiedCorrection?: string | null;
  reviewerUserId?: string | null;
  isApprovedForTraining: boolean;
  datasetVersion?: string | null;
  createdAt: string;
}

// ── Persistent Memory Operations ─────────────────────────────────────────────

export async function getMemories(
  category?: MemoryCategory,
  entityType?: MemoryEntityType,
  entityId?: string
): Promise<PersistentMemoryRecord[]> {
  const clauses: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (category) {
    clauses.push(`category = $${idx++}`);
    params.push(category);
  }
  if (entityType) {
    clauses.push(`entity_type = $${idx++}`);
    params.push(entityType);
  }
  if (entityId) {
    clauses.push(`entity_id = $${idx++}`);
    params.push(entityId);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const res = await query<any>(
    `SELECT id, category, entity_type AS "entityType", entity_id AS "entityId",
            memory_key AS "memoryKey", content, provenance, created_by AS "createdBy",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM ai_persistent_memories
     ${where}
     ORDER BY updated_at DESC`,
    params
  );
  return res.rows;
}

export async function setMemory(
  category: MemoryCategory,
  entityType: MemoryEntityType,
  entityId: string | null,
  memoryKey: string,
  content: Record<string, any>,
  provenance: MemoryProvenance,
  userId?: string
): Promise<PersistentMemoryRecord> {
  const memoryId = id('mem');
  const res = await query<any>(
    `INSERT INTO ai_persistent_memories (
       id, category, entity_type, entity_id, memory_key, content, provenance, created_by, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
     ON CONFLICT (category, entity_type, entity_id, memory_key)
     DO UPDATE SET
       content = EXCLUDED.content,
       provenance = EXCLUDED.provenance,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id, category, entity_type AS "entityType", entity_id AS "entityId",
               memory_key AS "memoryKey", content, provenance, created_by AS "createdBy",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [memoryId, category, entityType, entityId || null, memoryKey, JSON.stringify(content), provenance, userId || null]
  );

  await logActivity(userId, 'SET_AI_MEMORY', 'AI_MEMORY', res.rows[0].id, `Saved ${category} memory for ${entityType}:${entityId}`);
  return res.rows[0];
}

export async function deleteMemory(memoryId: string, userId?: string): Promise<boolean> {
  const res = await query(`DELETE FROM ai_persistent_memories WHERE id = $1`, [memoryId]);
  if (res.rowCount > 0) {
    await logActivity(userId, 'DELETE_AI_MEMORY', 'AI_MEMORY', memoryId, `Deleted memory record ${memoryId}`);
    return true;
  }
  return false;
}

// ── Controlled Feedback & Evaluation Pipeline ────────────────────────────────

export async function logAiFeedback(params: {
  userId?: string;
  role: string;
  queryText: string;
  responseText: string;
  rating: 'helpful' | 'unhelpful' | 'inaccurate' | 'flagged';
  feedbackComment?: string;
  failureCategory?: string;
  verifiedCorrection?: string;
}): Promise<AiFeedbackRecord> {
  const feedbackId = id('fb');
  const res = await query<any>(
    `INSERT INTO ai_feedback_logs (
       id, user_id, role, query_text, response_text, rating, feedback_comment,
       failure_category, verified_correction, is_approved_for_training
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
     RETURNING id, user_id AS "userId", role, query_text AS "queryText",
               response_text AS "responseText", rating, feedback_comment AS "feedbackComment",
               failure_category AS "failureCategory", verified_correction AS "verifiedCorrection",
               reviewer_user_id AS "reviewerUserId", is_approved_for_training AS "isApprovedForTraining",
               dataset_version AS "datasetVersion", created_at AS "createdAt"`,
    [
      feedbackId,
      params.userId || null,
      params.role,
      params.queryText,
      params.responseText,
      params.rating,
      params.feedbackComment || null,
      params.failureCategory || null,
      params.verifiedCorrection || null,
    ]
  );

  await logActivity(params.userId, 'AI_FEEDBACK_LOGGED', 'AI_FEEDBACK', feedbackId, `Logged ${params.rating} feedback for ${params.role}`);
  return res.rows[0];
}

export async function reviewFeedbackItem(
  feedbackId: string,
  reviewerUserId: string,
  approveForTraining: boolean,
  datasetVersion = 'v1.0'
): Promise<boolean> {
  const res = await query(
    `UPDATE ai_feedback_logs
     SET reviewer_user_id = $1, is_approved_for_training = $2, dataset_version = $3
     WHERE id = $4`,
    [reviewerUserId, approveForTraining, datasetVersion, feedbackId]
  );
  if (res.rowCount > 0) {
    await logActivity(reviewerUserId, 'AI_FEEDBACK_REVIEWED', 'AI_FEEDBACK', feedbackId, `Approved: ${approveForTraining} for version ${datasetVersion}`);
    return true;
  }
  return false;
}

export async function listBenchmarkDatasets(): Promise<any[]> {
  const res = await query(`SELECT * FROM ai_benchmark_datasets ORDER BY created_at DESC`);
  return res.rows;
}

export async function createOrUpdateBenchmarkDataset(
  version: string,
  testCases: any[],
  benchmarkScores: Record<string, any> = {}
): Promise<any> {
  const bid = id('bench');
  const res = await query<any>(
    `INSERT INTO ai_benchmark_datasets (id, version, test_cases, benchmark_scores, promoted_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT (version)
     DO UPDATE SET test_cases = EXCLUDED.test_cases, benchmark_scores = EXCLUDED.benchmark_scores, promoted_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [bid, version, JSON.stringify(testCases), JSON.stringify(benchmarkScores)]
  );
  return res.rows[0];
}
