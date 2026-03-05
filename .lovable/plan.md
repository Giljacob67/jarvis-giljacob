

## Plano: Corrigir leitura de números no TTS ElevenLabs

### Problema
O ElevenLabs pronuncia números, datas, valores monetários e horários de forma incorreta ou inconsistente em português, especialmente no modelo turbo.

### Solução em 2 frentes

#### 1. Adicionar `apply_text_normalization: "on"` na edge function
No `supabase/functions/elevenlabs-tts/index.ts`, incluir o parâmetro no body da requisição à API do ElevenLabs. Isso ativa a normalização nativa (converte números para texto antes de sintetizar).

#### 2. Pré-processar o texto antes de enviar ao TTS
Na função `fetchTTSAudioUrl` em `src/pages/Chat.tsx`, adicionar uma etapa de normalização de números em PT-BR **antes** de enviar ao TTS. Isso garante controle total, independente da normalização da API.

A função de pré-processamento converteria:
- `R$ 1.250,90` → `mil duzentos e cinquenta reais e noventa centavos`
- `14:30` → `quatorze e trinta`
- `01/02/2025` → `primeiro de fevereiro de dois mil e vinte e cinco`
- Números simples como `1234` → `mil duzentos e trinta e quatro`
- Porcentagens como `15%` → `quinze por cento`
- Telefones como `(11) 99999-1234` → formatação por dígitos

**Abordagem**: Criar uma função utilitária `normalizeNumbersForTTS(text: string): string` com regex para detectar e converter os padrões mais comuns em PT-BR. Isso é feito client-side, sem custo extra de API.

### Arquivos alterados
1. **`supabase/functions/elevenlabs-tts/index.ts`** — adicionar `apply_text_normalization: "on"` no body
2. **`src/lib/tts-normalize.ts`** — novo arquivo com a função de normalização de números PT-BR
3. **`src/pages/Chat.tsx`** — chamar `normalizeNumbersForTTS()` no `fetchTTSAudioUrl` antes de enviar o texto

