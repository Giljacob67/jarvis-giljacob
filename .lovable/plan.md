

## Plano: 4 Upgrades — Troca por Comando + HUD + Plan Runner + Anti-Repetição

### A) Troca de Perfil por Comando (sem LLM)

**Problema atual**: A troca via chat funciona, mas passa pelo LLM (gasta tokens, ~2-3s). O badge no header já alterna localmente mas não persiste no banco.

**Solução**: Command router no frontend que intercepta antes de enviar ao backend.

**Chat.tsx — `sendMessage`** (antes do `streamChat`):
- Regex: `/^(jarvis[,]?\s*)?(modo|perfil)\s+(pessoal|profissional)/i`
- Se match:
  1. Determinar `newMode` ("pessoal" → "personal", "profissional" → "professional")
  2. Se já é o modo ativo, responder "Você já está no modo X."
  3. Caso contrário: `setJarvisMode(newMode)`, `setActiveProfile(allProfiles[newMode])`
  4. Persistir no banco: `UPDATE jarvis_profiles SET is_active = true WHERE user_id AND profile_type = newMode` + `is_active = false` no outro
  5. Inserir mensagem assistant sintética: "Certo. Modo {X} ativado."
  6. Se TTS ativo, enfileirar a frase no TTS
  7. `return` — não chamar `streamChat`
- Tempo estimado: <300ms (apenas DB update local)

**Badge no header**: Já existe (linha 963-981). Atualmente alterna local sem persistir. Adicionar a mesma lógica de persistência no `onClick`.

**SettingsPage**: Nenhuma mudança necessária — o `loadProfiles` já lê `is_active` do banco.

### B) HUD / Console de Ações (Tool Calls Visíveis)

**Novo componente**: `src/components/ToolHUD.tsx`

```text
┌─────────────────────────────────┐
│ 🔧 Executando: list_tasks...    │  ← status "running"
│ ✓ list_tasks (320ms)            │  ← status "done"  
│ 🔧 Executando: calendar...      │
└─────────────────────────────────┘
```

**Tipo**:
```typescript
type ToolStatus = {
  id: string;
  tool: string;
  status: "running" | "done" | "error";
  startedAt: number;
  endedAt?: number;
  result?: any;
};
```

**Chat.tsx**:
- Novo state: `const [toolStatuses, setToolStatuses] = useState<ToolStatus[]>([])`
- No `onToolCalls` callback:
  - Para cada `tc`: se `tc.result` existe → marcar "done" com `endedAt`; senão → marcar "running"
- Problema: atualmente o `tool_calls_meta` SSE chega **depois** das tools terminarem (linha 1304 do backend). Para HUD em tempo real, precisamos de um segundo SSE **antes** da execução.

**Backend change** (`chat/index.ts`):
- Antes de `pMap`, enviar SSE `tool_calls_start`:
  ```json
  {"choices":[{"delta":{"tool_calls_start": [{"tool":"list_tasks"},{"tool":"calendar"}]}}]}
  ```
- O frontend usa isso para criar status "running".
- O `tool_calls_meta` existente (após execução) marca tudo como "done".

**ToolHUD renderização**:
- Posicionado acima da área de input ou inline na mensagem
- Auto-dismiss após 5s quando todas as tools terminam
- Cards especiais para resultados acionáveis (create_task → botão "Abrir tarefas", etc.)

### C) Plan Runner (Execução Multi-Step)

**Migração DB** — 2 novas tabelas:

```sql
CREATE TABLE public.execution_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, running, paused, done, failed
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.execution_plans ENABLE ROW LEVEL SECURITY;
-- RLS: user can CRUD own plans

CREATE TABLE public.execution_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.execution_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  step_index integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  tool_name text,
  tool_args jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending', -- pending, running, done, failed, needs_confirmation
  result text,
  requires_confirmation boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.execution_steps ENABLE ROW LEVEL SECURITY;
-- RLS: user can CRUD own steps
```

**Backend** (`chat/index.ts`):
- O tool `create_execution_plan` já existe (linha 367). Atualmente só gera o plano como texto.
- Alterar `executeTool` para `create_execution_plan`:
  1. Inserir na tabela `execution_plans`
  2. Inserir cada step em `execution_steps`
  3. Para steps com `tool` != "manual" e `requires_confirmation = false`: executar imediatamente via `pMap` (concurrency=3)
  4. Para steps sensíveis (send_email, create_calendar_event): marcar `needs_confirmation`
  5. Retornar resumo do progresso

**Nova página**: `src/pages/Plans.tsx`
- Lista planos do usuário com status
- Cada plano expandível mostrando steps e status
- Botão "Continuar" para steps pendentes de confirmação

**App.tsx**: Adicionar rota `/plans`
**AppSidebar.tsx**: Adicionar link "Planos"

### D) Anti-Repetição / Session State

**Implementação no backend** (`chat/index.ts`):

1. **Session State object** — passado no body do request e mantido no frontend:
```typescript
type SessionState = {
  lastTopics: string[];           // últimos tópicos abordados
  lastToolResults: Record<string, { data: string; timestamp: number }>;  // cache de tools
  lastBriefingTimestamp: number;
  conversationStartedAt: number;
};
```

2. **Frontend** (`Chat.tsx`):
   - `sessionStateRef = useRef<SessionState>({...})`
   - Enviar no body: `sessionState: sessionStateRef.current`
   - Ao receber tool results, atualizar o cache local

3. **Backend — Tool Cache**:
   - Antes de executar tool, checar `sessionState.lastToolResults[toolName]`
   - Se resultado tem <10 min: reutilizar, adicionar nota "(dados de X min atrás)"
   - Se usuário disse "atualiza/refresh/atualizar": ignorar cache

4. **System Prompt additions**:
```
ANTI-REPETIÇÃO:
- NÃO repita briefing/agenda se já mencionou nos últimos 30 min
- NÃO traga tópicos não solicitados se já foram cobertos (ex: academia/treino)
- Respostas por voz: máximo 1-2 frases. Se precisar detalhar, pergunte "Quer que eu detalhe?"
- NÃO faça perguntas desnecessárias. Assuma default razoável e ofereça alternativa
- Se o mesmo tópico foi discutido recentemente, responda de forma resumida
```

5. **Cooldown de tópicos**: O session state rastreia tópicos. O prompt instrui a não repetir.

### Resumo de Arquivos

| Arquivo | Alteração |
|---|---|
| `src/pages/Chat.tsx` | Command router, ToolHUD state, session state ref |
| `src/components/ToolHUD.tsx` | **Novo** — HUD visual de tools |
| `src/pages/Plans.tsx` | **Novo** — página de planos |
| `src/App.tsx` | Rota `/plans` |
| `src/components/AppSidebar.tsx` | Link "Planos" |
| `supabase/functions/chat/index.ts` | SSE tool_calls_start, plan runner execution, tool cache, anti-repetição no prompt |
| Migração SQL | Tabelas `execution_plans` + `execution_steps` com RLS |

### Ordem de Implementação

1. **A** (Troca por comando) — menor e independente
2. **D** (Anti-repetição) — mudanças no prompt + session state
3. **B** (HUD) — novo componente + SSE adicional
4. **C** (Plan Runner) — migração + nova página + lógica complexa

