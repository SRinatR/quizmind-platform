import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHistoryPromptDisplay, getHistoryTimelineSummary } from '../src/app/app/history/history-prompt-display';

const QUICK_PREFIX = 'Return only the final answer without solution steps. If options are labeled (letters or numbers), return ONLY correct labels separated by commas (for example: a, d). If the question has options but they are unlabeled, number from 1 and answer as: N) option text. If no options exist (free-text question), return ONLY the answer. Question:';
const VISION_PREFIX = 'Read the screenshot carefully. Double-check option labels before answering. If options are labeled, output only labels (e.g. a, d). If unlabeled options exist, output: N) option text. If no options (text/fill-in question), output only the answer text. Return final answer only.';

test('quick-answer prompt shows only cleaned question in timeline summary', () => {
  const question = 'What is 12 × 9?';
  const display = buildHistoryPromptDisplay({
    promptContentJson: [{ role: 'user', content: `${QUICK_PREFIX} ${question}` }],
    requestType: 'text',
  });

  const summary = getHistoryTimelineSummary({
    cleanQuestionText: display.cleanQuestionText,
    promptExcerpt: `${QUICK_PREFIX} ${question}`,
    requestType: 'text',
    hasImages: display.hasImages,
  });

  assert.equal(summary, question);
  assert.equal(display.promptInstructionText, QUICK_PREFIX);
});

test('system prompt content is not used as timeline summary', () => {
  const display = buildHistoryPromptDisplay({
    promptContentJson: [{ role: 'system', content: 'You are a test assistant. Return only one label.' }],
    promptExcerpt: 'You are a test assistant. Return only one label.',
    requestType: 'text',
  });

  const summary = getHistoryTimelineSummary({
    cleanQuestionText: display.cleanQuestionText,
    promptExcerpt: 'You are a test assistant. Return only one label.',
    requestType: 'text',
    hasImages: display.hasImages,
  });

  assert.equal(display.cleanQuestionText, '');
  assert.equal(summary, 'Question');
});

test('image request with vision prefix returns screenshot summary and hasImages true', () => {
  const display = buildHistoryPromptDisplay({
    promptContentJson: [{ role: 'user', content: `${VISION_PREFIX}` }],
    requestType: 'image',
    attachments: [{
      id: 'att_1',
      role: 'prompt',
      kind: 'image',
      mimeType: 'image/png',
      sizeBytes: 1234,
      deleted: false,
      expired: false,
    }],
  });

  const summary = getHistoryTimelineSummary({
    cleanQuestionText: display.cleanQuestionText,
    promptExcerpt: VISION_PREFIX,
    requestType: 'image',
    hasImages: display.hasImages,
  });

  assert.equal(display.hasImages, true);
  assert.equal(summary, 'Screenshot question');
});

test('unknown prompt format falls back to sanitized excerpt', () => {
  const promptExcerpt = 'Solve: 2 + 2 = ?';
  const display = buildHistoryPromptDisplay({
    promptContentJson: null,
    promptExcerpt,
    requestType: 'text',
  });

  const summary = getHistoryTimelineSummary({
    cleanQuestionText: display.cleanQuestionText,
    promptExcerpt,
    requestType: 'text',
    hasImages: display.hasImages,
  });

  assert.equal(summary, promptExcerpt);
});
