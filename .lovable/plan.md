

# Plano: Integração com Notion

## Contexto

A integração com o Notion requer uma **Internal Integration Token** (API Key) que o usuário cria no site do Notion. Não há conector nativo disponível no Lovable para o Notion.

## O que será feito

### 1. Solicitar a API Key do Notion
- Usar a ferramenta `add_secret` para pedir ao usuário o `NOTION_API_KEY`
- Guiar o usuário para criar uma Integration em [notion.so/my-integrations](https://www.notion.so/my-integrations)
- O usuário precisa compartilhar as páginas/databases desejadas com a integration

### 2. Criar Edge Function `notion-api`
- **`supabase/functions/notion-api/index.ts`**: Proxy para a API do Notion v1
- Ações suportadas: `search` (buscar páginas/databases), `list_databases`, `query_database`, `get_page`, `create_page`
- Usa o `NOTION_API_KEY` armazenado como secret
- Headers necessários: `Authorization: Bearer {token}`, `Notion-Version: 2022-06-28`

### 3. Substituir a página placeholder
- **`src/pages/NotionPage.tsx`**: Interface funcional com:
  - Barra de busca para encontrar páginas e databases
  - Lista de resultados com ícones e títulos
  - Visualização de databases com suas propriedades
  - Botão para criar novas páginas em um database selecionado
  - Estado de conexão (conectado/desconectado baseado em se a function responde)

### 4. Configuração no `supabase/config.toml`
- Adicionar `[functions.notion-api]` com `verify_jwt = false`

## Fluxo do usuário

1. Cria uma Integration em notion.so/my-integrations
2. Compartilha as páginas desejadas com a integration
3. Cola o token no Lovable (via `add_secret`)
4. Acessa a página Notion no app e vê suas páginas/databases

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/notion-api/index.ts` | Nova edge function proxy para Notion API |
| `src/pages/NotionPage.tsx` | UI funcional com busca, listagem e criação |
| `supabase/config.toml` | Adicionar config da function |

