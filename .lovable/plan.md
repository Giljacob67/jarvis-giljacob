

# Plano: Fase 2 (Voz ElevenLabs) + Fase 3 (Banco de dados e autenticação)

## Resultado do teste

O chat com IA está **100% funcional**. Jarvis respondeu em streaming com personalidade e formatação corretas. O microfone e TTS usam APIs do navegador — não é possível testar via automação, mas o código está integrado corretamente.

## Próximos passos

### 1. Conectar ElevenLabs para voz premium

O conector ElevenLabs já existe no workspace mas não está vinculado ao projeto. Vamos:

- Vincular o conector ElevenLabs ao projeto (disponibiliza `ELEVENLABS_API_KEY`)
- Criar edge function `elevenlabs-tts` que recebe texto e retorna áudio MP3 usando a API ElevenLabs com modelo `eleven_multilingual_v2`
- Escolher uma voz grave e natural (ex: "Brian" ou "Daniel") para combinar com a personalidade do Jarvis
- Atualizar `Chat.tsx` para usar ElevenLabs TTS no lugar do `speechSynthesis` do navegador — reproduzindo o áudio retornado pela edge function
- Manter fallback para `speechSynthesis` caso a API falhe

### 2. Criar banco de dados e autenticação

Criar as tabelas necessárias para persistência:

- Tabela `profiles` — dados do usuário (nome, preferências)
- Tabela `conversations` — histórico de conversas por usuário
- Tabela `messages` — mensagens individuais com `conversation_id` e `user_id`
- RLS policies para isolar dados por usuário
- Criar páginas de Login e Signup com email/senha
- Proteger rotas — redirecionar para login se não autenticado
- Persistir mensagens do chat no banco e carregar ao abrir conversa

### 3. Escopo das mudanças

**Arquivos novos:**
- `supabase/functions/elevenlabs-tts/index.ts` — edge function TTS
- `src/pages/Auth.tsx` — página de login/signup
- `src/hooks/use-auth.tsx` — contexto de autenticação
- Migration SQL para tabelas

**Arquivos editados:**
- `src/pages/Chat.tsx` — integrar ElevenLabs TTS + persistência de mensagens
- `src/App.tsx` — adicionar rota de auth e proteção de rotas
- `src/hooks/use-speech-synthesis.ts` — substituir por ElevenLabs

