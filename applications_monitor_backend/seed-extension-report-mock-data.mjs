import 'dotenv/config';
import mongoose from 'mongoose';
import { JobModel } from './JobModel.js';

const MOCK_OPERATOR = 'mock-extension-qa';
const MOCK_CODE = 'MOCK-QA-EXT';
const TIER_TEST_OPERATOR = 'mock-extension-tier-test';
const TIER_TEST_CODE = 'MOCK-TIER-EXT';

function formatIstDate(day, hour, minute, second) {
  const hh = hour > 12 ? hour - 12 : hour;
  const normalizedHour = hh === 0 ? 12 : hh;
  const period = hour >= 12 ? 'pm' : 'am';
  return `${day}/${3}/2026, ${normalizedHour}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')} ${period}`;
}

function buildMockDocs() {
  const docs = [];
  for (let day = 24; day <= 30; day += 1) {
    for (let idx = 1; idx <= 2; idx += 1) {
      const client = `mock-client-${day}-${idx}@example.com`;
      const timestamp = formatIstDate(day, 10 + idx, 10 + idx, 10 + idx);
      docs.push({
        jobID: `mock-ext-${day}-${idx}-${Date.now()}`,
        dateAdded: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
        userID: client,
        jobTitle: `Mock QA Job ${day}-${idx}`,
        currentStatus: `applied by ${MOCK_OPERATOR}`,
        jobDescription: 'Mock extension report job for QA verification',
        joblink: `https://example.com/mock-job-${day}-${idx}`,
        companyName: `Mock Company ${day}`,
        timeline: ['Added', 'Applied'],
        attachments: [],
        downloaded: true,
        operatorName: 'Mock QA',
        operatorEmail: 'mock-extension-qa@flashfirehq.com',
        extensionCode: MOCK_CODE,
        addedBy: MOCK_OPERATOR,
        appliedDate: `${day}/3/2026`,
      });
    }
  }
  return docs;
}

function buildTierTestDocs() {
  const docs = [];
  const day = 30;
  for (let clientIndex = 1; clientIndex <= 30; clientIndex += 1) {
    const client = `tier-client-${String(clientIndex).padStart(2, '0')}@example.com`;
    for (let jobIndex = 1; jobIndex <= 21; jobIndex += 1) {
      const hour = jobIndex % 2 === 0 ? 11 : 12;
      const minute = (jobIndex * 2) % 60;
      const second = (jobIndex * 3) % 60;
      const timestamp = formatIstDate(day, hour, minute, second);
      docs.push({
        jobID: `mock-tier-${clientIndex}-${jobIndex}-${Date.now()}`,
        dateAdded: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
        userID: client,
        jobTitle: `Tier Test Job ${clientIndex}-${jobIndex}`,
        currentStatus: `applied by ${TIER_TEST_OPERATOR}`,
        jobDescription: 'Mock extension incentive tier test job',
        joblink: `https://example.com/tier-job-${clientIndex}-${jobIndex}`,
        companyName: `Tier Test Company ${clientIndex}`,
        timeline: ['Added', 'Applied'],
        attachments: [],
        downloaded: true,
        operatorName: 'Mock Tier Test',
        operatorEmail: 'mock-extension-tier-test@flashfirehq.com',
        extensionCode: TIER_TEST_CODE,
        addedBy: TIER_TEST_OPERATOR,
        appliedDate: `${day}/3/2026`,
      });
    }
  }
  return docs;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  await JobModel.deleteMany({ addedBy: { $in: [MOCK_OPERATOR, TIER_TEST_OPERATOR] } });

  const docs = [...buildMockDocs(), ...buildTierTestDocs()];
  const result = await JobModel.insertMany(docs, { ordered: true });

  console.log(JSON.stringify({
    inserted: result.length,
    operators: [MOCK_OPERATOR, TIER_TEST_OPERATOR],
    daysCovered: ['2026-03-24', '2026-03-30'],
  }, null, 2));

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
