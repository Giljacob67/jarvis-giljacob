

## Plano: Modo Dinâmico do Jarvis (Pessoal/Profissional via Chat)

### Resumo
Eliminar a necessidade de trocar perfis manualmente nas configurações. O Jarvis passará a suportar troca de modo via comandos naturais no chat, mantendo um estado de sessão no frontend que é enviado ao backend junto com **ambos** os perfis.

### O que muda

**1. Frontend (`src/pages/Chat.tsx`)**
- Adicionar estado `jarvisMode` (`"personal"` | `"professional"`, padrão: `"personal"`)
- Carregar **ambos** os perfis do banco (não só o ativo) no `useEffect` de load profile
- Enviar para o backend: `{ messages, profile: activeProfileData, jarvisMode }` onde `activeProfileData` contém os dados de **ambos** os perfis
- Detectar no retorno do assistente se houve troca de modo (o backend instrui o modelo a usar um marcador como `[MODE:professional]` ou `[MODE:personal]` no início da resposta) e atualizar `jarvisMode` no estado local
- Exibir indicador visual discreto do modo atual (badge no header do chat)

**2. Backend (`supabase/functions/chat/index.ts`)**
- Receber `jarvisMode` do frontend
- Modificar `buildSystemPrompt` para aceitar ambos os perfis e o modo ativo
- Unificar o system prompt em um único prompt que contém:
  - Regras gerais do Jarvis (já existentes)
  - Seção `MODO PESSOAL` com instruções do perfil pessoal
  - Seção `MODO PROFISSIONAL` com instruções do perfil profissional
  - Instrução: `"Seu modo atual é: ${jarvisMode}. Aplique APENAS o comportamento deste modo."`
  - Instrução de detecção: quando o usuário pedir mudança de modo, confirmar brevemente e prefixar a resposta com `[MODE:xxx]`
  - Instrução de sugestão automática: se detectar assunto claramente do outro modo, sugerir a troca

**3. Sem mudanças no banco de dados**
- O `jarvisMode` vive apenas no estado da sessão (React state)
- Os perfis continuam salvos separadamente em `jarvis_profiles`
- A toggle de "ativo" nas configurações pode continuar existindo mas deixa de ser o fator determinante no chat

### Fluxo de Uso

```text
Usuário: "Jarvis, modo profissional"
→ Backend detecta via prompt, modelo responde: "[MODE:professional] Certo. Modo profissional ativado."
→ Frontend parseia [MODE:professional], atualiza jarvisMode, remove o marcador da mensagem exibida
→ Próximas mensagens usam comportamento profissional

Usuário: "Analise essa decisão judicial"  (em modo pessoal)
→ Jarvis sugere: "Parece um assunto profissional. Deseja que eu ative o modo profissional?"
```

### Arquivos Modificados
- `src/pages/Chat.tsx` — estado `jarvisMode`, carregar ambos perfis, badge visual, parsing de `[MODE:xxx]`
- `supabase/functions/chat/index.ts` — `buildSystemPrompt` unificado, receber `jarvisMode` no request body

