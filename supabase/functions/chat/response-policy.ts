export function applyVoiceBudget(rawText: string): { text: string; truncated: boolean } {
  const text = (rawText || "").replace(/\s+/g, " ").trim();
  if (!text) return { text, truncated: false };

  const sentenceRegex = /[^.!?\n]+[.!?]?/g;
  const allSentences = (text.match(sentenceRegex) || [])
    .map((s) => s.trim())
    .filter(Boolean);

  // Default target: 2 short sentences. Hard max: 3.
  const maxSentences = 3;
  const selected: string[] = [];
  let charBudget = 240;

  for (const sentence of allSentences) {
    if (selected.length >= maxSentences) break;
    const nextLen = selected.join(" ").length + sentence.length;
    if (selected.length >= 2 && nextLen > charBudget) break;
    selected.push(sentence);
  }

  if (selected.length === 0) {
    selected.push(allSentences[0] || text.slice(0, 120));
  }

  const merged = selected.join(" ").trim();
  const truncated = merged.length < text.length;
  if (!truncated) return { text: merged, truncated: false };

  const withPrompt = `${merged} Quer que eu detalhe?`.replace(/\s+/g, " ").trim();
  return { text: withPrompt, truncated: true };
}

export function chunkForSSE(text: string, chunkSize = 28): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}
