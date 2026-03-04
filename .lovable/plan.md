

# Plano: Dashboard Dinâmico + App Instalável (PWA) para iPhone

## Problema 1: Dashboard com dados estáticos

O Dashboard atual usa dados **hardcoded** (arrays constantes). Não consulta a API do Gmail, Calendar, nem a tabela `activity_logs`. Por isso nunca atualiza.

### Solução

Transformar o Dashboard em componente dinâmico que busca dados reais ao carregar:

1. **Card E-mails** — Chamar a edge function `gmail-api` com action `list` para contar e-mails não lidos
2. **Card Agenda** — Chamar a edge function `calendar-api` para buscar eventos do dia
3. **Card Tarefas** — (Não há sistema de tarefas real ainda; manter placeholder ou criar tabela futuramente)
4. **Atividade Recente** — Consultar a tabela `activity_logs` do banco para mostrar as últimas ações reais do usuário
5. **Briefing Diário** — Montar o texto do briefing com base nos dados reais obtidos acima
6. **Saudação personalizada** — Usar o nome do perfil (`profiles.full_name`) e ajustar "Bom dia/Boa tarde/Boa noite" conforme o horário
7. **Loading states** — Adicionar skeletons enquanto os dados carregam

### Detalhes técnicos
- Usar `useQuery` do TanStack Query para cada fonte de dados (gmail, calendar, activity_logs)
- Tratar erros graciosamente (ex: Google não conectado → mostrar "Conecte o Google")
- Manter as animações Framer Motion existentes

---

## Problema 2: Uso no iPhone

A melhor opção é transformar o app em **PWA (Progressive Web App)** — um app instalável direto do navegador, sem precisar da App Store.

### O que o usuário ganha
- Ícone na tela inicial do iPhone, como um app nativo
- Abre em tela cheia (sem barra do navegador)
- Carrega rápido e funciona offline para telas já visitadas

### Implementação

1. **Instalar `vite-plugin-pwa`** e configurar no `vite.config.ts`
2. **Criar manifest** com nome "JARVIS", ícones, cores do tema e `display: "standalone"`
3. **Adicionar meta tags** no `index.html` para iOS (apple-mobile-web-app-capable, apple-touch-icon, theme-color, viewport)
4. **Criar ícones PWA** (192x192 e 512x512) na pasta `public/`
5. **Configurar service worker** com navigateFallbackDenylist para `/~oauth` (para não quebrar o login Google)

Após publicar, basta abrir no Safari do iPhone → Compartilhar → "Adicionar à Tela de Início".

---

## Resumo de arquivos afetados

- `src/pages/Dashboard.tsx` — reescrever com dados dinâmicos
- `vite.config.ts` — adicionar plugin PWA
- `index.html` — meta tags para iOS
- `public/` — ícones PWA (manifest.webmanifest gerado pelo plugin)

