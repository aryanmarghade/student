/**
 * server/routes/ai-feedback-routes.ts
 * -----------------------------------
 * API routes for persistent memory inspection and controlled AI learning / feedback.
 */

import { Router } from 'express';
import { requireAuth, AuthRequest } from '../auth.js';
import {
  logAiFeedback,
  getMemories,
  setMemory,
  deleteMemory,
  reviewFeedbackItem,
  listBenchmarkDatasets,
  MemoryCategory,
  MemoryEntityType,
  MemoryProvenance,
} from '../memory-learning-service.js';

const router = Router();
router.use(requireAuth);

// Log user feedback (thumbs up/down, comments, rating)
router.post('/feedback', async (req: AuthRequest, res) => {
  try {
    const {
      queryText,
      answerText,
      rating: rawRating,
      isHelpful,
      feedbackCategory,
      userComment,
      correctedAnswer,
    } = req.body;

    const rating: 'helpful' | 'unhelpful' | 'inaccurate' | 'flagged' =
      ['helpful', 'unhelpful', 'inaccurate', 'flagged'].includes(rawRating)
        ? rawRating
        : (isHelpful === false || rawRating === 1 || rawRating === 2)
          ? 'unhelpful'
          : 'helpful';

    const logged = await logAiFeedback({
      userId: req.user!.id,
      role: req.user!.role,
      queryText: queryText || '',
      responseText: answerText || '',
      rating,
      feedbackComment: userComment || null,
      failureCategory: feedbackCategory || null,
      verifiedCorrection: correctedAnswer || null,
    });

    res.status(201).json({ message: 'Feedback recorded for evaluation', feedback: logged });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to record feedback.' });
  }
});

// Retrieve persistent memories
router.get('/memories', async (req: AuthRequest, res) => {
  try {
    const { category, entityType, entityId } = req.query;
    const memories = await getMemories(
      category ? (String(category) as MemoryCategory) : undefined,
      entityType ? (String(entityType) as MemoryEntityType) : undefined,
      entityId ? String(entityId) : undefined
    );
    res.json(memories);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve memories.' });
  }
});

// Set a persistent memory (for teachers, placement, admin)
router.post('/memories', async (req: AuthRequest, res) => {
  try {
    if (req.user!.role === 'student') {
      return res.status(403).json({ error: 'Students cannot create arbitrary persistent system memories.' });
    }
    const {
      category = 'student_fact',
      entityType = 'student',
      entityId = null,
      memoryKey,
      key,
      content,
      provenance = 'teacher_approved',
    } = req.body;

    const mKey = memoryKey || key;
    if (!mKey || !content) {
      return res.status(400).json({ error: 'Memory key and content are required.' });
    }

    const mem = await setMemory(
      category as MemoryCategory,
      entityType as MemoryEntityType,
      entityId,
      mKey,
      typeof content === 'object' ? content : { text: content },
      provenance as MemoryProvenance,
      req.user!.id
    );
    res.status(201).json(mem);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create memory.' });
  }
});

// Delete or invalidate a memory
router.delete('/memories/:id', async (req: AuthRequest, res) => {
  try {
    if (req.user!.role === 'student') {
      return res.status(403).json({ error: 'Students cannot delete system memories.' });
    }
    const ok = await deleteMemory(req.params.id, req.user!.id);
    if (!ok) return res.status(404).json({ error: 'Memory not found.' });
    res.json({ message: 'Memory record marked inactive.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete memory.' });
  }
});

// Review feedback item (for controlled learning dataset curation)
router.post('/feedback/:id/review', async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== 'admin' && req.user!.role !== 'teacher') {
      return res.status(403).json({ error: 'Only authorized staff can approve feedback for training datasets.' });
    }
    const { approveForTraining, datasetVersion } = req.body;
    const ok = await reviewFeedbackItem(
      req.params.id,
      req.user!.id,
      Boolean(approveForTraining),
      datasetVersion || 'v1.0'
    );
    if (!ok) return res.status(404).json({ error: 'Feedback log item not found.' });
    res.json({ message: 'Feedback log item reviewed successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to review feedback item.' });
  }
});

// Benchmark datasets
router.get('/benchmarks', async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== 'admin' && req.user!.role !== 'teacher' && req.user!.role !== 'placement') {
      return res.status(403).json({ error: 'Access denied to benchmark datasets.' });
    }
    const datasets = await listBenchmarkDatasets();
    res.json(datasets);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list benchmark datasets.' });
  }
});

export default router;
