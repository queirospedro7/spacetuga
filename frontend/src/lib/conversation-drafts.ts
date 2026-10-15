// Drafts stay in this session and are scoped to the account and conversation.
const drafts = new Map<string, string>();
export const getDraft = (key: string) => drafts.get(key) || '';
export function setDraft(key: string, value: string) { if (value) drafts.set(key, value); else drafts.delete(key); if (drafts.size > 100) drafts.delete(drafts.keys().next().value!); }
