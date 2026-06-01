/**
 * Cross-instance cache for heavy analytics (e.g. /api/analytics/client-job-analysis).
 *
 * Why: in production we run multiple Node instances, so the in-memory cache
 * (utils/analysisCache.js) is disabled for correctness — which meant EVERY
 * request re-ran a full-collection aggregation (multi-second). This stores the
 * computed result in one shared MongoDB collection so any instance can serve a
 * recent result, and supports stale-while-revalidate (serve stale instantly,
 * recompute in the background).
 *
 * Every operation is wrapped so a cache failure NEVER breaks the request path —
 * a miss just falls through to a live compute.
 */
import mongoose from 'mongoose';

const analysisCacheSchema = new mongoose.Schema(
  {
    _id: { type: String }, // cache key (e.g. '__all__' or a date string)
    val: { type: mongoose.Schema.Types.Mixed },
    exp: { type: Number }, // epoch ms after which the entry is stale
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, minimize: false }
);

// Reuse the model across hot-reloads / repeated imports.
const AnalysisCacheModel =
  mongoose.models.AnalysisCacheEntry ||
  mongoose.model('AnalysisCacheEntry', analysisCacheSchema, 'analysis_cache');

// Mongo document hard limit is 16MB; skip persisting anything that risks it.
const MAX_PERSIST_BYTES = 15 * 1024 * 1024;

let _warned = false;
function warnOnce(err) {
  if (_warned) return;
  _warned = true;
  console.warn('[persistentAnalysisCache] disabled for this process:', err?.message || err);
}

/**
 * @returns {Promise<{val:any, fresh:boolean}|null>} cached entry (with freshness) or null on miss/error.
 */
export async function pGetAnalysisCache(key) {
  try {
    if (mongoose.connection?.readyState !== 1) return null;
    const doc = await AnalysisCacheModel.findById(key).lean();
    if (!doc || doc.val == null) return null;
    return { val: doc.val, fresh: Date.now() <= (doc.exp || 0) };
  } catch (err) {
    warnOnce(err);
    return null;
  }
}

export async function pSetAnalysisCache(key, val, ttlMs) {
  try {
    if (mongoose.connection?.readyState !== 1) return;
    // Cheap size guard — avoid throwing on oversized docs.
    let size = 0;
    try { size = Buffer.byteLength(JSON.stringify(val)); } catch { size = 0; }
    if (size > MAX_PERSIST_BYTES) return;
    await AnalysisCacheModel.updateOne(
      { _id: key },
      { $set: { val, exp: Date.now() + (ttlMs || 120_000), updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (err) {
    warnOnce(err);
  }
}

export async function pClearAnalysisCache() {
  try {
    if (mongoose.connection?.readyState !== 1) return;
    await AnalysisCacheModel.deleteMany({});
  } catch (err) {
    warnOnce(err);
  }
}
