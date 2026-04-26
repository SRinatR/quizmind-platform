import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHistoryPromptDisplay, getHistoryTimelineSummary } from '../src/app/app/history/history-prompt-display';

const QUICK_PREFIX = 'Return only the final answer without solution steps. If options are labeled (letters or numbers), return ONLY correct labels separated by commas (for example: a, d). If the question has options but they are unlabeled, number from 1 and answer as: N) option text. If no options exist (free-text question), return ONLY the answer. Question:';

test('list item with full promptContentJson containing quick-answer prefix produces real question preview', () => {
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

test('truncated promptExcerpt without Question marker does not produce fake generic text', () => {
  const display = buildHistoryPromptDisplay({
    promptContentJson: null,
    promptExcerpt: 'Return only the final answer without solution steps. If options are labeled',
    requestType: 'text',
  });

  const summary = getHistoryTimelineSummary({
    cleanQuestionText: display.cleanQuestionText,
    promptExcerpt: 'Return only the final answer without solution steps. If options are labeled',
    requestType: 'text',
    hasImages: display.hasImages,
  });

  assert.equal(display.cleanQuestionText, '');
  assert.equal(summary, '');
});

test('image-only prompt shows image and no generic text fallback', () => {
  const display = buildHistoryPromptDisplay({
    promptContentJson: [{ role: 'user', content: [{ type: 'input_image', image_url: 'https://example.com/q.png' }] }],
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
    promptExcerpt: null,
    requestType: 'image',
    hasImages: display.hasImages,
  });

  assert.equal(display.hasImages, true);
  assert.equal(summary, '');
});

test('unknown prompt format falls back safely to promptExcerpt', () => {
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
