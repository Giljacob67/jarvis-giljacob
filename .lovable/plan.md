

# Plano para tornar o Jarvis operacional

## Estado atual

O projeto tem a **interface visual completa** (Dashboard, Chat, e 8 páginas placeholder), mas tudo é estático com dados mockados. Não há backend, banco de dados, nem integrações reais.

O **Lovable Cloud já está ativo** (LOVABLE_API_KEY disponível), o que permite avançar imediatamente.

## Prioridades para tornar operacional

A operacionalização completa é um projeto grande. Recomendo avançar em fases:

---

### Fase 1 — Chat com IA real (impacto imediato)

Substituir as respostas simuladas do chat por respostas reais da Lovable AI (Gemini), com streaming token-a-token.

- Criar edge function `supabase/functions/chat/index.ts` com system prompt do Jarvis (personalidade, idioma PT-BR, tom)
- Atualizar `Chat.tsx` para enviar mensagens à edge function e renderizar resposta em streaming
- Instalar `react-markdown` para renderizar formatação nas respostas
- Manter histórico de mensagens na sessão para contexto conversacional

### Fase 2 — Voz (ElevenLabs + reconhecimento)

Dar voz ao Jarvis usando o conector ElevenLabs já disponível na plataforma.

- Conectar o conector ElevenLabs ao projeto
- Criar edge function para Text-to-Speech (ler respostas do Jarvis em voz)
- Integrar Web Speech API para reconhecimento de fala (Speech-to-Text no navegador)
- Conectar o botão de microfone ao reconhecimento de voz real

### Fase 3 — Banco de dados e autenticação

Criar a infraestrutura de persistência para memória e multi-usuário.

- Ativar banco de dados no Lovable Cloud
- Criar tabelas: `conversations`, `messages`, `user_preferences`
- Adicionar autenticação (login/signup) para separar dados por usuário
- Persistir histórico de chat no banco

### Fase 4 — Integrações externas

Conectar serviços reais (Gmail, Calendar, etc.) — cada uma requer OAuth e edge functions dedicadas. Esta fase é incremental e pode ser feita serviço por serviço.

---

## Recomendação

**Começar pela Fase 1** — em uma única iteração o chat do Jarvis passa a funcionar com IA real, dando vida ao assistente. É a mudança com maior impacto e menor complexidade.

Deseja que eu implemente a Fase 1 (chat com IA real)?

