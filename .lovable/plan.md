

## Análise do Prompt JARVIS — O que falta

Comparei seu prompt com o que está implementado no projeto. Aqui está o diagnóstico:

---

### Já Implementado (pode remover ou marcar como "done" no prompt)

| Item do Prompt | Status |
|---|---|
| Voice pipeline (STT → LLM → TTS streaming) | ✅ Implementado |
| Barge-in (interrupção) | ✅ Implementado |
| Orchestrator (intent → tool → response) | ✅ Implementado |
| Tool calling (tasks, calendar, memory) | ✅ Implementado |
| Memory system (short/long/operational) | ✅ Implementado |
| Skills registry (Agenda, Tasks, Email, Legal, Planner) | ✅ Implementado |
| Proactive mode + focus mode | ✅ Implementado |
| Smart confirmations | ✅ Implementado |
| Dashboard with greeting, priorities, alerts | ✅ Implementado |
| Legal skills (analyze, draft, compare) | ✅ Implementado |

---

### O que Falta no Prompt vs Implementação

#### 1. **Vector Memory (RAG) — Mencionado no prompt, NÃO implementado**
O prompt fala em `document_chunks` com embeddings e `pgvector`, mas o projeto não tem:
- Tabela `document_chunks` com coluna `embedding vector(1536)`
- Extensão `pgvector` habilitada
- Busca por similaridade semântica
- Nenhum upload/processamento de documentos

**Plano**: Criar tabela `documents` + `document_chunks` com pgvector, edge function para processar uploads (extrair texto, chunkar, gerar embeddings), e tool `search_documents(query)` no chat.

#### 2. **Tabela `tool_logs` (Auditoria) — Mencionado, NÃO implementado**
O prompt pede "Jarvis fez X às 14:32" mas não há logging das tool executions. O `activity_logs` existe mas não é usado pelo chat.

**Plano**: Após cada `executeTool`, inserir log em `activity_logs` com `action_type: "tool"`, metadata com tool name e args.

#### 3. **File Storage / Document Upload — Mencionado, NÃO implementado**
O prompt fala em `documents` table e `summarize_document(file)`, mas não existe:
- Storage bucket para PDFs/DOCs
- Upload UI
- Processamento de documentos

**Plano**: Criar bucket `documents`, UI de upload na página Files, edge function para extrair texto e gerar chunks.

#### 4. **Tabela `preferences` separada — Mencionado, mas está no `jarvis_profiles`**
O prompt sugere tabela `preferences`, mas isso já é coberto por `jarvis_profiles.user_preferences` (JSONB). Não precisa de tabela separada — o prompt pode ser atualizado.

#### 5. **E-mail: envio (draft/send) — Mencionado, NÃO implementado**
O prompt fala "Email Assistant" com envio, mas o chat só lê e-mails. Não há tool `send_email` ou `draft_email`.

**Plano**: Adicionar tools `draft_email` e `send_email` com confirmação obrigatória.

#### 6. **Latência <1s — Parcialmente**
O pipeline atual faz 2 chamadas LLM (1 non-streaming para tools + 1 streaming para resposta). Isso adiciona latência. Para mensagens sem tools, ainda re-faz a chamada em streaming (double call).

**Otimização possível**: Se a resposta inicial não tem tool_calls E tem content, usar esse content diretamente em vez de re-chamar.

---

### Problemas no Próprio Prompt

1. **Stack desatualizada**: O prompt menciona "React / Next.js / React Native (Expo)" e "Cloudflare Workers / Vercel Functions". O projeto real usa **React + Vite + Supabase Edge Functions**. O prompt deve refletir a stack real.

2. **Project structure `/jarvis/apps/web`** — não se aplica. O projeto é monorepo simples com `src/` e `supabase/`.

3. **"Generate deliverables"** — essa seção é para geração inicial. Como o projeto já existe, essa parte do prompt é irrelevante.

4. **Tabela `users`** — não existe e não precisa. Usa `auth.users` + `profiles`.

5. **Falta menção ao ElevenLabs STT** — O prompt só fala TTS. O projeto também usa ElevenLabs Scribe v2 para STT (fallback mobile).

---

### Plano de Implementação Sugerido (o que falta de real)

| Prioridade | Item | Esforço |
|---|---|---|
| 1 | Auditoria de tools (log em activity_logs) | Pequeno |
| 2 | Tool `send_email` / `draft_email` com confirmação | Médio |
| 3 | Otimizar double-call LLM (evitar re-chamada quando não há tools) | Pequeno |
| 4 | Storage bucket + upload de documentos | Médio |
| 5 | pgvector + RAG (busca semântica em documentos) | Grande |

Quer que eu implemente esses itens? Posso começar pelos mais simples (auditoria + otimização LLM) ou ir direto para o RAG com documentos.

