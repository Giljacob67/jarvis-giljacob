

# Plano: Corrigir voz ElevenLabs + Integração Gmail

## Problema da voz

Dois problemas identificados:

1. **Markdown na fala**: O texto enviado ao ElevenLabs contém markdown bruto (`**negrito**`, `- listas`, `### títulos`). A API lê literalmente "asterisco asterisco". Solução: criar função `stripMarkdown()` que remove toda formatação antes de enviar ao TTS.

2. **Voz robótica/lenta**: Os voice settings atuais usam `stability: 0.6` e `style: 0.3`. Para um tom mais conversacional e natural, vamos ajustar para `stability: 0.4`, `similarity_boost: 0.85`, `style: 0.5` e `speed: 1.1`. Também trocar o modelo para `eleven_turbo_v2_5` que tem menor latência.

### Mudanças

**`src/pages/Chat.tsx`**: Adicionar função `stripMarkdown(text)` que remove `**`, `*`, `#`, `` ` ``, `[]()`, etc. antes de chamar `playElevenLabsTTS`.

**`supabase/functions/elevenlabs-tts/index.ts`**: Ajustar voice_settings e modelo para voz mais natural e rápida.

---

## Integração Gmail (Fase 4.1)

Gmail não tem conector disponível na plataforma. Vamos usar OAuth do Google via edge function.

### Arquitetura

```text
[Chat.tsx / Emails.tsx]
      ↓
[Edge Function: gmail-api]
      ↓
[Google Gmail API via OAuth token]
```

### Fluxo OAuth

1. Usuário clica "Conectar Gmail" na página de Emails
2. Redireciona para Google OAuth consent screen (scopes: `gmail.readonly`, `gmail.send`)
3. Google redireciona de volta com auth code
4. Edge function troca code por access/refresh tokens e armazena no banco
5. Requisições subsequentes usam o token armazenado

### Tabelas necessárias

- `google_tokens` — armazena `access_token`, `refresh_token`, `expires_at` por `user_id`, com RLS

### Edge Functions

- `gmail-auth` — gera URL de consent e troca auth code por tokens
- `gmail-api` — proxy autenticado para Gmail API (listar, ler, enviar emails)

### Frontend

- `src/pages/Emails.tsx` — interface completa: lista de emails, visualização, composição, botão conectar
- Componentes: `EmailList`, `EmailView`, `ComposeEmail`

### Pré-requisitos

O usuário precisará criar credenciais OAuth no Google Cloud Console e fornecer `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` como secrets.

---

## Resumo de mudanças

| Arquivo | Ação |
|---|---|
| `src/pages/Chat.tsx` | Strip markdown antes do TTS |
| `supabase/functions/elevenlabs-tts/index.ts` | Ajustar modelo e voice settings |
| `supabase/functions/gmail-auth/index.ts` | Novo — OAuth flow |
| `supabase/functions/gmail-api/index.ts` | Novo — proxy Gmail API |
| `src/pages/Emails.tsx` | Reescrever — interface Gmail completa |
| Migration SQL | Tabela `google_tokens` com RLS |

