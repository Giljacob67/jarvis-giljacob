

## Status e Proximos Passos

### Fase 1 -- Concluida

Barge-in e TTS por chunks semanticos ja estao implementados em `Chat.tsx` e `elevenlabs-tts/index.ts`. O Jarvis agora fala enquanto pensa e pode ser interrompido.

### Proxima: Fase 2 -- Tarefas + Painel "Hoje"

Seguindo o roadmap aprovado, a Fase 2 traz uso diario real ao Jarvis.

---

### 1. Tabela `tasks` no banco

```sql
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  priority integer NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  status text NOT NULL DEFAULT 'pending',
  due_date date,
  estimated_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
-- RLS: users can CRUD own tasks
```

### 2. Pagina de Tarefas (`src/pages/Tasks.tsx`)

- Filtros: Hoje / Semana / Atrasadas / Todas
- Criar tarefa inline (titulo + prioridade + data)
- Marcar como concluida com um toque
- Indicador de prioridade (1=alta vermelha, 2=media amarela, 3=baixa verde)
- Layout mobile-first

### 3. Dashboard "Hoje" aprimorado (`src/pages/Dashboard.tsx`)

- Card "Top 3 Prioridades" -- mostra as 3 tarefas mais urgentes do dia
- Card "Tempo Disponivel" -- calcula horas livres com base na agenda
- Saudacao contextual: "Boa tarde, Gilberto. Voce tem 2 reunioes e 1 tarefa atrasada."
- Card de alertas: prazos proximos, tarefas atrasadas

### 4. Sidebar atualizada

- Adicionar link "Tarefas" no `AppSidebar.tsx` com icone CheckSquare

---

### Sobre suas sugestoes de arquitetura avancada

Captei tudo. Os conceitos de multi-agentes, Planner, Tool Router, Skills, memoria vetorial e proatividade controlada estao registrados e serao incorporados nas fases seguintes:

- **Fase 3**: Tool calling no chat (Jarvis cria tarefas/eventos por voz) + confirmacoes inteligentes
- **Fase 4**: Memoria inteligente com camadas (curta/longa/operacional) + RAG basico
- **Fase 5**: Skills registry + Planner para tarefas complexas
- **Fase 6**: Proatividade com cron + modo foco + notificacoes PWA

Esses conceitos nao mudam a Fase 2 -- eles entram quando o tool calling e a memoria estiverem prontos.

---

### Resumo das mudancas da Fase 2

| Arquivo | Mudanca |
|---------|---------|
| Migracao SQL | Tabela `tasks` com RLS |
| `src/pages/Tasks.tsx` | Nova pagina de tarefas |
| `src/pages/Dashboard.tsx` | Cards de prioridades, tempo disponivel, alertas |
| `src/components/AppSidebar.tsx` | Link para Tarefas |
| `src/App.tsx` | Rota `/tasks` |

