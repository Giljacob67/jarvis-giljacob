

## Plano: Página de Log de Atividades

### O que será construído

Uma página funcional que exibe o histórico de todas as ações executadas pelo Jarvis: disparos de automações, mensagens de chat, e-mails enviados, eventos criados, etc. Os logs serão persistidos no banco e exibidos em uma timeline filtrada.

### Etapas

**1. Criar tabela `activity_logs` no banco**

Colunas: `id`, `user_id`, `action_type` (automation_trigger, chat_message, email_sent, calendar_event, telegram_message, etc.), `title`, `description`, `status` (success/error), `metadata` (jsonb para dados extras), `created_at`. RLS por `user_id`.

**2. Registrar logs automaticamente nas edge functions existentes**

Inserir registros na tabela `activity_logs` quando ações são executadas:
- `make-webhook`: log ao disparar automação
- `chat`: log ao processar mensagem
- `gmail-api`: log ao enviar e-mail
- `calendar-api`: log ao criar evento
- `telegram-bot`: log ao receber/enviar mensagem

**3. Reescrever `src/pages/ActivityLog.tsx`**

- Timeline vertical com ícones por tipo de ação
- Filtros por tipo de ação (automação, chat, e-mail, etc.)
- Filtro por período (hoje, 7 dias, 30 dias)
- Filtro por status (sucesso/erro)
- Paginação ou scroll infinito
- Cada entrada mostra: ícone, título, descrição, status badge, timestamp relativo

### Detalhes Técnicos

- Tabela com RLS `auth.uid() = user_id` para SELECT/INSERT
- Edge functions usam service role client para inserir logs
- Frontend usa React Query com filtros como query params
- Formatação de datas com `date-fns` (já instalado)
- Limite de 50 registros por página com "carregar mais"

