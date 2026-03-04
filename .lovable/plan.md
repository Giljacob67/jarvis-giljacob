

# Plano: Integração Google Calendar (Fase 4.2)

## Arquitetura

Reutilizar a infraestrutura OAuth já existente (tabela `google_tokens` e edge function `gmail-auth`). Precisamos apenas adicionar o scope do Calendar ao fluxo OAuth e criar uma nova edge function para a API do Calendar.

```text
[Agenda.tsx]
      ↓
[Edge Function: calendar-api]
      ↓
[Google Calendar API via OAuth token existente]
```

## Mudanças necessárias

### 1. Adicionar scope do Calendar ao OAuth

**`supabase/functions/gmail-auth/index.ts`**: Adicionar `https://www.googleapis.com/auth/calendar` e `https://www.googleapis.com/auth/calendar.events` ao array de SCOPES. Usuários que já conectaram Gmail precisarão reconectar para autorizar o novo scope.

### 2. Nova Edge Function: `calendar-api`

**`supabase/functions/calendar-api/index.ts`**: Proxy autenticado para Google Calendar API. Reutiliza a mesma lógica de `getValidToken` do gmail-api. Ações suportadas:

- `list` — listar eventos de um período (padrão: semana atual)
- `get` — detalhes de um evento específico
- `create` — criar novo evento (título, data/hora início e fim, descrição, localização)
- `update` — editar evento existente
- `delete` — remover evento

### 3. Frontend: Reescrever `src/pages/Agenda.tsx`

Interface completa com:
- Verificação de conexão Google (reutiliza `gmail-auth` com `check_connection`)
- Botão "Conectar Google" se não conectado
- Visualização de calendário mensal usando o componente `Calendar` (react-day-picker) já existente
- Lista de eventos do dia selecionado
- Modal para criar/editar eventos com campos: título, data/hora início, data/hora fim, descrição, localização
- Botão de deletar evento

### 4. Config TOML

Adicionar `[functions.calendar-api]` com `verify_jwt = false` ao `supabase/config.toml`. (Nota: não editamos config.toml diretamente, será auto-gerado)

## Resumo de arquivos

| Arquivo | Ação |
|---|---|
| `supabase/functions/gmail-auth/index.ts` | Adicionar scopes do Calendar |
| `supabase/functions/calendar-api/index.ts` | Novo — proxy Calendar API |
| `src/pages/Agenda.tsx` | Reescrever — interface completa |

Nenhuma migration SQL necessária — reutiliza `google_tokens` existente.

