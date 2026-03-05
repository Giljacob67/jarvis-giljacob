

## Plano: Métricas de Latência + Limite de Concorrência nas Tools

### 1. Timestamp Logging no Frontend (Chat.tsx)

Adicionar instrumentação de latência em pontos-chave do pipeline:

- **`t0_speechEnd`**: capturado no momento em que o STT faz commit (VAD end-of-speech) ou o usuário clica em enviar
- **`t1_firstDelta`**: timestamp do primeiro `onDelta` recebido do SSE
- **`t2_firstTTSPlay`**: timestamp do `audio.play()` do primeiro chunk TTS

Logs emitidos via `console.log` com prefixo `[LATENCY]`:
```
[LATENCY] speechEnd→firstDelta: 420ms
[LATENCY] speechEnd→firstAudio: 680ms  
[LATENCY] firstDelta→firstAudio: 260ms
```

**Onde**:
- `sendMessage`: registrar `t0` no início
- `upsertAssistant` (primeiro chunk): registrar `t1`
- `processTTSQueue` (primeiro `audio.play()`): registrar `t2`
- Usar refs (`latencyRef`) para armazenar os timestamps sem re-renders

### 2. Limite de Concorrência nas Tools (chat/index.ts)

Atualmente `Promise.all(toolCalls.map(...))` executa todas em paralelo sem limite. Adicionar um helper `pMap` com concorrência máxima de 3:

```typescript
async function pMap<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
```

Substituir `Promise.all(toolResultsPromises)` por `pMap(toolCalls, executeOneTool, 3)`.

**Arquivo**: `supabase/functions/chat/index.ts` linhas 1213-1231

### 3. Métricas no Backend (chat/index.ts)

Adicionar logs de timing no backend também:
- `t_toolsStart` e `t_toolsEnd` ao redor da execução paralela
- Log: `[PERF] tools executed in Xms (N tools, concurrency=3)`
- `t_preambleWrite`: timestamp do envio do preamble SSE

### Resumo de Arquivos

| Arquivo | Alteração |
|---|---|
| `src/pages/Chat.tsx` | Adicionar refs de latência, logs em `sendMessage`, `upsertAssistant`, `processTTSQueue` |
| `supabase/functions/chat/index.ts` | Helper `pMap` com concurrency=3, logs de timing no backend |

Não há QA automatizado possível no iPhone via browser tools -- os testes manuais ficam com você usando os logs `[LATENCY]` e `[PERF]` que serão emitidos no console.

