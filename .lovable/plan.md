

# Plano: Integração com Telegram Bot

## Contexto

A integração com Telegram requer um **Bot Token** obtido via @BotFather no Telegram. O bot permitirá enviar e receber mensagens diretamente pelo app Jarvis.

## Arquitetura

O Telegram Bot API funciona via polling ou webhooks. Para o Jarvis, usaremos **polling manual via edge function** (o usuário busca mensagens sob demanda ou com refresh) e envio direto de mensagens.

```text
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Frontend   │────▶│  Edge Function   │────▶│ Telegram API │
│ TelegramPage│     │  telegram-bot    │     │  api.telegram │
└─────────────┘     └──────────────────┘     └──────────────┘
```

## O que será feito

### 1. Solicitar o Bot Token
- Usar `add_secret` para pedir `TELEGRAM_BOT_TOKEN`
- Guiar o usuário: abrir @BotFather no Telegram → `/newbot` → copiar o token

### 2. Criar Edge Function `telegram-bot`
- **`supabase/functions/telegram-bot/index.ts`**
- Ações suportadas:
  - `get_me` — verificar conexão do bot
  - `get_updates` — buscar mensagens recebidas (offset-based polling)
  - `send_message` — enviar mensagem para um chat_id
  - `get_chats` — listar chats recentes (extraídos dos updates)

### 3. Criar a página funcional
- **`src/pages/Telegram.tsx`** — Interface com:
  - Status de conexão do bot (nome, username)
  - Lista de conversas recentes (extraídas dos updates)
  - Área de chat para ler e enviar mensagens a um contato selecionado
  - Auto-refresh das mensagens a cada 5 segundos
  - Input para enviar mensagens

### 4. Atualizar `supabase/config.toml`
- Adicionar `[functions.telegram-bot]` com `verify_jwt = false`

## Fluxo do usuário

1. Abre @BotFather no Telegram → cria bot → copia token
2. Cola o token no Lovable (via `add_secret`)
3. Envia uma mensagem para o bot no Telegram (necessário para criar o primeiro chat)
4. Acessa a página Telegram no app → vê conversas e pode responder

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/telegram-bot/index.ts` | Nova edge function proxy para Telegram Bot API |
| `src/pages/Telegram.tsx` | UI funcional com chat bidirecional |

