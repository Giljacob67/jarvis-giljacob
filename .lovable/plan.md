

## Análise do Protótipo e Plano de Implementação

Analisei a imagem do seu protótipo. Ele apresenta elementos interessantes que podemos incorporar ao projeto atual:

### Elementos identificados no protótipo:
1. **Relógio digital grande** com data por extenso (estilo HUD/Jarvis)
2. **Card de Clima** — temperatura atual e condição (ex: 29°C, Nublado)
3. **Card de Notícias** — feed de notícias resumido
4. **Orbe central interativa** — botão de voz "segure para falar" (press-and-hold)
5. **Botão "Jornal"** — acesso rápido a notícias
6. **Botão "Export"** — exportar conversas
7. **Campo de texto** na parte inferior

### Plano de implementação

#### 1. Redesenhar o Dashboard com elementos do protótipo
- Adicionar um **relógio digital estilo HUD** no topo (hora grande + data por extenso em PT-BR), substituindo o header textual atual
- Criar um **card de Clima** usando uma API gratuita (OpenWeatherMap) via edge function, mostrando temperatura e condição com ícone
- Criar um **card de Notícias** usando uma API de notícias brasileiras (ex: NewsAPI) via edge function, mostrando manchetes do dia
- Manter os cards existentes (e-mails, agenda, atividade) abaixo

#### 2. Botão de voz estilo "Orbe" no Chat
- Substituir o botão de microfone atual por uma **orbe central** animada (similar ao JarvisAvatar mas interativa)
- Implementar **press-and-hold** (segure para falar): ao pressionar a orbe, inicia gravação; ao soltar, envia
- Manter o campo de texto e botão enviar abaixo da orbe

#### 3. Botões de ação rápida
- Adicionar botão **"Jornal"** que abre um painel/modal com notícias do dia
- Adicionar botão **"Export"** para exportar o histórico de chat (JSON/texto)

### Detalhes técnicos

- **Clima**: Nova edge function `weather-api` que consulta OpenWeatherMap. Necessário o secret `OPENWEATHER_API_KEY`.
- **Notícias**: Nova edge function `news-api` que consulta NewsAPI.org. Necessário o secret `NEWS_API_KEY`.
- **Dashboard**: Reorganizar layout com relógio no topo, clima e notícias em grid lado a lado (como no protótipo), seguido pelos cards existentes.
- **Chat**: Refatorar a área de input para incluir a orbe central com `onPointerDown`/`onPointerUp` para press-and-hold, e os botões Jornal/Export nas laterais.

### Prioridade sugerida
1. Relógio HUD + layout do Dashboard
2. Card de Clima (requer API key)
3. Card de Notícias (requer API key)
4. Orbe interativa no Chat com press-and-hold
5. Botões Jornal e Export

