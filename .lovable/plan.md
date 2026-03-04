

## Plano: Página de Automações com Lista de Webhooks do Make

### O que será construído

Uma página funcional de automações onde você poderá cadastrar, gerenciar e disparar webhooks do Make manualmente. Cada automação terá nome, descrição, URL do webhook e um botão de disparo com feedback de status.

### Etapas

**1. Criar tabela `automations` no banco de dados**

Colunas: `id`, `user_id`, `name`, `description`, `webhook_url`, `last_triggered_at`, `last_status` (success/error/pending), `created_at`, `updated_at`. RLS para que cada usuário veja apenas suas automações.

**2. Criar edge function `make-webhook`**

Recebe o `automation_id`, busca a URL do webhook no banco, faz um POST para o Make e atualiza `last_triggered_at` e `last_status`. Isso evita expor a URL do webhook no frontend.

**3. Reescrever `src/pages/Automations.tsx`**

Interface com:
- Lista de automações cadastradas em cards
- Botão "Nova Automação" abre dialog com formulário (nome, descrição, URL do webhook)
- Cada card mostra nome, descrição, status da última execução e botão "Disparar"
- Botão de disparar chama a edge function e mostra feedback (loading, sucesso, erro)
- Opções de editar e excluir cada automação

### Detalhes Técnicos

- Tabela com RLS por `user_id` (SELECT, INSERT, UPDATE, DELETE)
- Edge function valida autenticação via JWT do header
- Frontend usa React Query para CRUD na tabela `automations`
- O disparo chama `supabase.functions.invoke('make-webhook', { body: { automation_id } })`

