

# Configuração do Google Cloud Console — Guia Completo

## Respondendo suas perguntas

**O Client ID é provisório?** Não necessariamente. O `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` que você configurou nos secrets do projeto são permanentes — são as credenciais do seu projeto no Google Cloud Console. O que muda são os **Redirect URIs** que você precisa adicionar conforme o domínio do app muda.

**Quando publicar, preciso adicionar outro link?** Sim. Hoje o app roda no domínio de preview. Quando você publicar, ele terá um novo domínio (ex: `seuapp.lovable.app` ou um domínio customizado). Você precisará adicionar os novos Redirect URIs no Google Cloud Console.

## URIs que você precisa configurar agora

O código usa `window.location.origin + "/emails"` e `window.location.origin + "/agenda"` como redirect URIs. Portanto, no Google Cloud Console, em **Credentials → OAuth 2.0 Client ID → Authorized redirect URIs**, adicione:

```text
https://id-preview--620cf0bf-6d50-4eca-9afe-e994f62d0a89.lovable.app/emails
https://id-preview--620cf0bf-6d50-4eca-9afe-e994f62d0a89.lovable.app/agenda
```

Quando publicar, adicione também:
```text
https://SEU-DOMINIO.lovable.app/emails
https://SEU-DOMINIO.lovable.app/agenda
```

## Checklist completo no Google Cloud Console

1. **APIs habilitadas** — Verifique que **Gmail API** e **Google Calendar API** estão ativas em APIs & Services → Library

2. **Tela de consentimento OAuth** (OAuth consent screen):
   - Em **Authorized domains**, adicione `lovable.app`
   - Em **Scopes**, adicione os escopos não-sensíveis + os do Gmail/Calendar
   - Se o app está em modo **Testing**, adicione seu email (`gilberto.jacob@gmail.com`) como **Test user**

3. **Credenciais** (Credentials → OAuth 2.0 Client IDs):
   - Application type: **Web application**
   - Authorized redirect URIs: os 2 URIs listados acima
   - Copie o **Client ID** e **Client Secret** gerados

4. **Atualizar secrets no projeto** (se necessário) — Se você criou novas credenciais, eu posso atualizar os valores de `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` nos secrets do projeto

## Mudança de código necessária?

Nenhuma. O código já usa `window.location.origin` dinamicamente, então funciona tanto no preview quanto no domínio publicado — desde que os URIs estejam cadastrados no Google Cloud Console.

## Resumo

| Ação | Onde |
|---|---|
| Adicionar redirect URIs (preview) | Google Cloud Console → Credentials |
| Adicionar `lovable.app` como authorized domain | Google Cloud Console → OAuth consent screen |
| Adicionar seu email como test user | Google Cloud Console → OAuth consent screen (se em modo Testing) |
| Habilitar Gmail API e Calendar API | Google Cloud Console → APIs & Services |
| Quando publicar: adicionar novos redirect URIs | Google Cloud Console → Credentials |

