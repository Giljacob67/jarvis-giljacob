

## Fase 1 — Barge-in + TTS por Chunks Semânticos

Incorporando seu feedback detalhado, este é o plano refinado para a Fase 1.

---

### 1. Barge-in (Interrupção Natural)

**Problema**: Quando o usuário pressiona a Orbe enquanto o Jarvis fala, nada acontece — o áudio continua.

**Solução**: No `handleOrbDown`, antes de iniciar o STT:
- Chamar `sharedAudio.pause()` para cortar o áudio imediatamente
- Setar `isSpeaking = false`
- Cancelar qualquer fila de chunks pendentes (via flag `abortRef`)

Isso é simples e dá resultado imediato — sensação "cinema".

**Arquivo**: `src/pages/Chat.tsx`

---

### 2. TTS por Chunks Semânticos (não sentença inteira, não resposta inteira)

**Problema atual**: O TTS espera a resposta COMPLETA do LLM, depois gera o áudio inteiro, depois toca. Latência altíssima.

**Solução**: Conforme sua sugestão, usar **chunks semânticos** — quebrar por `.`, `!`, `?`, `\n` conforme o streaming do LLM vai chegando:

```text
LLM streaming → acumula texto → detecta fim de frase
                                    ↓
                              envia chunk ao TTS
                                    ↓
                              toca áudio imediatamente
                                    ↓
                         próximo chunk já está sendo gerado
```

**Implementação no frontend** (`Chat.tsx`):
- Novo estado: `ttsQueueRef` (fila de frases para TTS)
- No `onDelta` do streaming, acumular texto e detectar pontuação final (`.`, `!`, `?`, `\n`)
- Ao detectar fim de frase, enfileirar o chunk para TTS
- Player sequencial: toca chunk 1, quando termina toca chunk 2, etc.
- Flag `abortRef` para barge-in cancelar toda a fila

**Resultado**: O Jarvis começa a falar 1-2 segundos após o início da resposta, não 5-10 segundos depois.

**Arquivo**: `src/pages/Chat.tsx` (refatoração do `sendMessage` e `playElevenLabsTTS`)

---

### 3. Endpoint de TTS Streaming (edge function)

**Melhoria na edge function**: Usar o endpoint `/stream` do ElevenLabs ao invés do batch, para que cada chunk individual também retorne mais rápido.

- Alterar URL de `/v1/text-to-speech/{voice}` para `/v1/text-to-speech/{voice}/stream`
- Usar modelo `eleven_turbo_v2_5` para menor latência (manter `eleven_multilingual_v2` como fallback configurável)
- Retornar o stream diretamente como `Transfer-Encoding: chunked`

**Nota sobre Safari/iOS**: Como `MediaSource` API não é suportada no Safari mobile, o streaming da edge function será acumulado como blob no frontend antes de tocar. A vantagem ainda existe porque cada chunk de texto é pequeno (1 frase), então o TTS retorna rápido mesmo em modo blob.

**Arquivo**: `supabase/functions/elevenlabs-tts/index.ts`

---

### 4. Controle visual durante fala por chunks

- A Orbe e o avatar já animam com `isSpeaking` — manter isso ativo durante toda a sequência de chunks
- Mostrar indicador "Falando..." no header enquanto a fila de TTS está ativa
- Ao barge-in, parar animação imediatamente

**Arquivo**: `src/pages/Chat.tsx`

---

### Resumo das mudanças

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Chat.tsx` | Barge-in no `handleOrbDown`, fila de TTS por chunks semânticos, abort flag |
| `supabase/functions/elevenlabs-tts/index.ts` | Endpoint streaming + modelo turbo |

### Resultado esperado

- Latência percebida: de ~8s para ~1.5s
- Interrupção natural ao pressionar a Orbe
- Jarvis "fala enquanto pensa"
- Funciona em iOS/Safari com o workaround de blob existente

