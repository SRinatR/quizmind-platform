import { type AiHistoryAttachment, type AiHistoryFileMetadata, type AiRequestType } from '@quizmind/contracts';

const QUICK_ANSWER_USER_PREFIX = 'Return only the final answer without solution steps. If options are labeled (letters or numbers), return ONLY correct labels separated by commas (for example: a, d). If the question has options but they are unlabeled, number from 1 and answer as: N) option text. If no options exist (free-text question), return ONLY the answer. Question:';
const VISION_USER_PREFIX = 'Read the screenshot carefully. Double-check option labels before answering. If options are labeled, output only labels (e.g. a, d). If unlabeled options exist, output: N) option text. If no options (text/fill-in question), output only the answer text. Return final answer only.';

const SYSTEM_PROMPT_PREFIXES = [
  'You are a test assistant',
  'You are a visual quiz assistant',
];

interface ParsedPrompt {
  userText: string;
  systemText: string;
  fallbackText: string;
  hasImageInput: boolean;
}

export interface HistoryPromptDisplay {
  cleanQuestionText: string;
  promptInstructionText?: string;
  systemText?: string;
  hasImages: boolean;
  imageAttachments: AiHistoryAttachment[];
  hasPromptText: boolean;
}

export function sanitizeHistoryText(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, '[image attachment omitted]')
    .trim();
}

function parsePrompt(json: unknown, excerpt: string | null | undefined): ParsedPrompt {
  if (Array.isArray(json)) {
    const msgs = json as Array<Record<string, unknown>>;
    const gather = (role: string) => msgs
      .filter((m) => m.role === role)
      .flatMap((m) => {
        const c = m.content;
        if (typeof c === 'string') return [c];
        if (Array.isArray(c)) {
          return (c as Array<Record<string, unknown>>)
            .filter((b) => b.type === 'text' && typeof b.text === 'string')
            .map((b) => b.text as string);
        }
        return [];
      });

    const hasImageInput = msgs.some((m) => {
      if (m.role !== 'user') return false;
      const c = m.content;
      if (!Array.isArray(c)) return false;
      return (c as Array<Record<string, unknown>>).some((b) => {
        const t = typeof b.type === 'string' ? b.type : '';
        return t.includes('image');
      });
    });

    return {
      userText: gather('user').join('\n\n').trim(),
      systemText: gather('system').join('\n\n').trim(),
      fallbackText: '',
      hasImageInput,
    };
  }

  if (typeof json === 'string') {
    return { userText: '', systemText: '', fallbackText: sanitizeHistoryText(json), hasImageInput: false };
  }

  if (json !== null && json !== undefined) {
    return { userText: '', systemText: '', fallbackText: sanitizeHistoryText(JSON.stringify(json, null, 2)), hasImageInput: false };
  }

  return { userText: '', systemText: '', fallbackText: sanitizeHistoryText(excerpt), hasImageInput: false };
}

function stripKnownPrefix(userText: string, hasImages: boolean): { cleanQuestionText: string; promptInstructionText?: string } {
  if (userText.startsWith(QUICK_ANSWER_USER_PREFIX)) {
    return {
      cleanQuestionText: userText.slice(QUICK_ANSWER_USER_PREFIX.length).trim(),
      promptInstructionText: QUICK_ANSWER_USER_PREFIX,
    };
  }

  if (hasImages && userText.startsWith(VISION_USER_PREFIX)) {
    return {
      cleanQuestionText: userText.slice(VISION_USER_PREFIX.length).trim(),
      promptInstructionText: VISION_USER_PREFIX,
    };
  }

  return { cleanQuestionText: userText.trim() };
}

function startsWithSystemPrompt(text: string): boolean {
  return SYSTEM_PROMPT_PREFIXES.some((prefix) => text.startsWith(prefix));
}

export function buildHistoryPromptDisplay(input: {
  promptContentJson: unknown;
  promptExcerpt?: string | null;
  requestType: AiRequestType;
  attachments?: AiHistoryAttachment[];
}): HistoryPromptDisplay {
  const imageAttachments = (input.attachments ?? []).filter((a) => a.role === 'prompt' && a.kind === 'image');
  const parsed = parsePrompt(input.promptContentJson, input.promptExcerpt);
  const hasImages = parsed.hasImageInput || imageAttachments.length > 0 || input.requestType === 'image';
  const sourceText = parsed.userText || parsed.fallbackText;

  const stripped = stripKnownPrefix(sourceText, hasImages);
  const cleaned = sanitizeHistoryText(stripped.cleanQuestionText);
  const cleanQuestionText = startsWithSystemPrompt(cleaned) ? '' : cleaned;

  return {
    cleanQuestionText,
    promptInstructionText: stripped.promptInstructionText,
    systemText: parsed.systemText || undefined,
    hasImages,
    imageAttachments,
    hasPromptText: cleanQuestionText.length > 0,
  };
}

export function getHistoryTimelineSummary(input: {
  cleanQuestionText: string;
  promptExcerpt?: string | null;
  requestType: AiRequestType;
  hasImages: boolean;
  fileMetadata?: AiHistoryFileMetadata | null;
}): string {
  if (input.cleanQuestionText) return input.cleanQuestionText;
  if (input.requestType === 'image' || input.hasImages) return 'Screenshot question';
  if (input.requestType === 'file') return input.fileMetadata?.originalName || 'File question';

  const fallback = sanitizeHistoryText(input.promptExcerpt);
  if (!fallback || startsWithSystemPrompt(fallback)) return 'Question';
  return fallback;
}
