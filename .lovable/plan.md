

## Plano: Chat como Página Principal

### Mudança
Tornar `/chat` a rota padrão para todos os dispositivos (desktop e mobile), mantendo a sidebar como está.

### Alteração única: `src/App.tsx`
- Na rota `"/"` dentro de `ProtectedRoutes`, substituir a lógica condicional atual:
  ```tsx
  // De:
  <Route path="/" element={isMobile ? <Navigate to="/chat" replace /> : <Dashboard />} />
  // Para:
  <Route path="/" element={<Navigate to="/chat" replace />} />
  ```
- Remover o import de `useIsMobile` e `Dashboard` de `ProtectedRoutes` (Dashboard continua acessível via sidebar em `/dashboard`)
- Adicionar rota explícita para Dashboard: `<Route path="/dashboard" element={<Dashboard />} />`

### Sidebar: `src/components/AppSidebar.tsx`
- Atualizar o item "Dashboard" para apontar para `/dashboard` em vez de `/`

### Resultado
- Ao abrir o app, o usuário cai direto no Chat
- Dashboard continua disponível na sidebar via `/dashboard`
- Zero impacto no mobile (já funcionava assim)

