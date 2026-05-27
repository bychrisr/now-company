#!/usr/bin/env bash
# SessionStart.sh — Hook SessionStart local para projetos de desenvolvimento
# Verifica integridade do projeto, indexação e dependências no início da sessão.

set -uo pipefail

# ─── Configurações ────────────────────────────────────────────────────────────
CWD="${PWD:-$(pwd)}"
# Tenta localizar a raiz do Git
GIT_ROOT=$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null || echo "$CWD")
PROJECT_NAME=$(basename "$GIT_ROOT")

echo "---"
echo "🔍 INICIALIZAÇÃO LOCAL — PROJETO: ${PROJECT_NAME}"
echo "📍 Diretório: ${CWD}"

# ─── 1. Verificação do Grafo de Conhecimento (Graphify) ────────────────────────
# Verifica se o projeto está indexado pelo graphify
GRAPH_FILE="${GIT_ROOT}/graphify-out/graph.json"

if [[ -f "$GRAPH_FILE" ]]; then
  # Calcula a idade do arquivo em dias
  # No Linux, stat -c %Y retorna a data de modificação em epoch
  MOD_TIME=$(stat -c %Y "$GRAPH_FILE" 2>/dev/null || echo 0)
  CURRENT_TIME=$(date +%s)
  AGE_SECONDS=$((CURRENT_TIME - MOD_TIME))
  AGE_DAYS=$((AGE_SECONDS / 86400))

  if [[ "$AGE_DAYS" -gt 5 ]]; then
    echo "⚠️ ALERTA: O índice do Graphify deste projeto está desatualizado (modificado há ${AGE_DAYS} dias)."
    echo "   👉 Ação recomendada: Execute o comando /graphify para atualizar o mapa do repositório."
  else
    echo "✅ Índice Graphify atualizado (${AGE_DAYS} dias)."
  fi
else
  # Se não existe o graphify-out/graph.json, verifica se há arquivos de código relevantes no projeto
  # para sugerir a indexação (evitando sugerir em pastas vazias ou sem código)
  HAS_CODE=false
  # Procura por extensões de código comuns no projeto
  if find "$GIT_ROOT" -maxdepth 3 \( -name "*.ts" -o -name "*.js" -o -name "*.tsx" -o -name "*.jsx" -o -name "*.py" -o -name "*.go" -o -name "*.rs" \) -not -path "*/node_modules/*" -not -path "*/.git/*" -print -quit | grep -q .; then
    HAS_CODE=true
  fi

  if [[ "$HAS_CODE" == "true" ]]; then
    echo "⚠️ ALERTA: Este projeto possui arquivos de código, mas ainda não foi indexado pelo Graphify."
    echo "   👉 Ação necessária: Você DEVE executar o comando /graphify para mapear o projeto antes de realizar grandes tarefas."
  fi
fi

# ─── 2. Verificação de Dependências (Node.js/npm/pnpm/yarn) ────────────────────
if [[ -f "${GIT_ROOT}/package.json" ]]; then
  if [[ ! -d "${GIT_ROOT}/node_modules" ]]; then
    echo "⚠️ ALERTA: O arquivo package.json existe, mas a pasta node_modules não foi encontrada."
    echo "   👉 Ação necessária: Avise o usuário e sugira rodar 'npm install' ou 'pnpm install' se for necessário executar testes ou build."
  fi
fi

# ─── 3. Verificação de Branch Git ─────────────────────────────────────────────
if git -C "$GIT_ROOT" rev-parse --is-inside-work-tree &>/dev/null; then
  CURRENT_BRANCH=$(git -C "$GIT_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
  if [[ "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "master" ]]; then
    # Checa se existem modificações pendentes
    if ! git -C "$GIT_ROOT" diff --quiet 2>/dev/null || ! git -C "$GIT_ROOT" diff --cached --quiet 2>/dev/null; then
      echo "🔥 ALERTA DE SEGURANÇA: Você está trabalhando diretamente na branch '${CURRENT_BRANCH}' com alterações não salvas!"
      echo "   👉 Ação necessária: Crie uma feature branch (ex: git checkout -b feat/nome-da-task) antes de realizar commits."
    fi
  fi
fi

echo "---"
exit 0
