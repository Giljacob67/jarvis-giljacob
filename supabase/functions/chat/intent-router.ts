export type IntentCategory =
  | "mode_switch"
  | "direct_command"
  | "tool_action"
  | "status_query"
  | "document_analysis"
  | "open_conversation";

export type FastPathCommand = "mode_switch" | "stop" | "repeat" | "shorter" | "refresh";

export type IntentResult = {
  category: IntentCategory;
  fastPathCommand?: FastPathCommand;
  mode?: "personal" | "professional";
  refreshTarget?: "agenda" | "tarefas" | "emails" | "geral";
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function classifyIntent(lastUserMessage: string): IntentResult {
  const text = normalize(lastUserMessage || "");

  const modeMatch = text.match(/(?:jarvis\s*)?(?:modo|perfil)\s+(pessoal|profissional)/i);
  if (modeMatch) {
    return {
      category: "mode_switch",
      fastPathCommand: "mode_switch",
      mode: modeMatch[1].toLowerCase() === "pessoal" ? "personal" : "professional",
    };
  }

  if (/^(parar|pare|silencio|sil�ncio|stop|cala a boca)\b/.test(text)) {
    return { category: "direct_command", fastPathCommand: "stop" };
  }

  if (/^(repete|repita|repetir|de novo)\b/.test(text)) {
    return { category: "direct_command", fastPathCommand: "repeat" };
  }

  if (/(mais curto|resuma|resumir|curto|objetivo)/.test(text)) {
    return { category: "direct_command", fastPathCommand: "shorter" };
  }

  if (/^(atualiza|atualizar|refresh|recarrega|sincroniza)/.test(text)) {
    let refreshTarget: IntentResult["refreshTarget"] = "geral";
    if (/(agenda|calendario|calend�rio)/.test(text)) refreshTarget = "agenda";
    else if (/(tarefa|tarefas)/.test(text)) refreshTarget = "tarefas";
    else if (/(email|e-mail|gmail)/.test(text)) refreshTarget = "emails";
    return { category: "status_query", fastPathCommand: "refresh", refreshTarget };
  }

  if (/(documento|contrato|clausula|cl�usula|peticao|peti��o|juridic|jur�dic|analisar documento)/.test(text)) {
    return { category: "document_analysis" };
  }

  if (/(cria|criar|adiciona|adicionar|agenda|agendar|envia|enviar|salva|salvar|busca|buscar|procura)/.test(text)) {
    return { category: "tool_action" };
  }

  if (/(minhas|meus|hoje|status|como esta|como est�|qual|quais|listar|lista)/.test(text)) {
    return { category: "status_query" };
  }

  return { category: "open_conversation" };
}
