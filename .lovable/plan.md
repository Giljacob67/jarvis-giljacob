

# Plano: Reimplantar TTS + Corrigir Fallback

## 1. Reimplantar Edge Function `elevenlabs-tts`

O código já tem o Voice ID do Dyego (`eUAnqvLQWNX29twcYLUM`). Agora que você fez upgrade no plano ElevenLabs, basta reimplantar a function para garantir que está ativa.

## 2. Corrigir fallback do browser TTS

**`src/pages/Chat.tsx` linha 299**: O fallback do navegador usa `assistantContent` sem limpar markdown — por isso lê asteriscos. Trocar para `stripMarkdown(assistantContent)`.

```typescript
// Antes:
const utterance = new SpeechSynthesisUtterance(assistantContent);

// Depois:
const utterance = new SpeechSynthesisUtterance(stripMarkdown(assistantContent));
```

## Resumo

| Arquivo | Mudança |
|---|---|
| `supabase/functions/elevenlabs-tts/index.ts` | Reimplantar (sem alteração de código) |
| `src/pages/Chat.tsx` | Aplicar `stripMarkdown()` no fallback (linha 299) |

