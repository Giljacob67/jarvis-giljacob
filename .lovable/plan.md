

## Problema

O Jarvis **não recebe o fuso horário real do usuário**. A data/hora no system prompt está **hardcoded para `America/Sao_Paulo`** (linha 1131 de `chat/index.ts`). As coordenadas que você forneceu são usadas apenas para o clima, não para determinar o fuso horário.

Além disso, o frontend (`Chat.tsx`, linha 66) não envia nenhuma informação de timezone — apenas `messages`, `profile` e `jarvisMode`.

## Solução

### 1. Frontend: enviar o timezone real do dispositivo

No `Chat.tsx`, incluir `Intl.DateTimeFormat().resolvedOptions().timeZone` no body da requisição ao chat. Isso captura automaticamente o fuso do iPhone/navegador (ex: `America/Sao_Paulo`, `America/New_York`, `Europe/Lisbon`).

**Arquivo**: `src/pages/Chat.tsx` — adicionar `userTimezone` ao `JSON.stringify` na linha 66.

### 2. Backend: usar o timezone do cliente

No `chat/index.ts`, extrair `userTimezone` do body da requisição e usá-lo no `Intl.DateTimeFormat` em vez do hardcoded `"America/Sao_Paulo"`.

Aplicar o mesmo timezone dinâmico em todos os pontos que usam `America/Sao_Paulo`:
- Linha 1131: formatação da data/hora atual no system prompt
- Linha 80, 86, 88: formatação de eventos do calendário
- Linhas 621-622: criação de eventos no Google Calendar

**Arquivo**: `supabase/functions/chat/index.ts` — propagar `userTimezone` por todas as funções que formatam datas.

### 3. Fallback

Se o frontend não enviar timezone (versão antiga em cache), manter `America/Sao_Paulo` como fallback.

### Resultado

O Jarvis passa a saber a data e hora exatas do dispositivo do usuário, independente de onde ele esteja.

