

# Plano: Responsividade Mobile + Envio Automático por Voz

## 1. Tornar o app responsivo para celular

O layout atual usa uma sidebar fixa de 264px (`w-64`, `ml-64`) que não funciona em telas pequenas.

### Mudanças:

**`src/components/AppSidebar.tsx`**
- Adicionar estado de aberto/fechado controlado por botão hamburger
- Em mobile (`< 768px`): sidebar fica oculta por padrão, abre como overlay com backdrop escuro
- Em desktop: comportamento atual mantido (fixa à esquerda)

**`src/components/AppLayout.tsx`**
- Usar `useIsMobile()` para alternar entre layout com sidebar fixa e layout mobile
- Em mobile: remover `ml-64`, adicionar header com botão hamburger + logo
- Passar estado aberto/fechado para o sidebar

**`src/pages/Chat.tsx`**
- Ajustar `max-w-[70%]` das mensagens para `max-w-[85%]` em mobile
- Padding responsivo nos containers

**`src/index.css`**
- Nenhuma mudança necessária (já usa Tailwind responsive)

## 2. Envio automático por voz (sem precisar clicar enviar)

Atualmente o microfone transcreve para o campo de input e o usuário precisa clicar enviar.

### Mudanças:

**`src/pages/Chat.tsx`**
- Alterar o comportamento do botão de microfone: ao clicar, inicia gravação. Ao clicar novamente (parar), envia a mensagem automaticamente
- No `useSpeechRecognition`, usar o callback `onEnd` para disparar o envio
- Adicionar um ref para acumular o transcript durante a sessão de voz e enviar tudo ao parar

### Fluxo:
1. Usuário clica no microfone → começa a ouvir
2. Fala é transcrita no campo de input (feedback visual)
3. Usuário clica novamente para parar → mensagem é enviada automaticamente
4. Alternativa: se o reconhecimento terminar sozinho (silêncio), também envia

## Resumo de arquivos

| Arquivo | Mudança |
|---|---|
| `src/components/AppLayout.tsx` | Layout responsivo com header mobile + hamburger |
| `src/components/AppSidebar.tsx` | Sidebar colapsável em mobile (overlay) |
| `src/pages/Chat.tsx` | Auto-envio ao parar microfone + ajustes responsivos |

