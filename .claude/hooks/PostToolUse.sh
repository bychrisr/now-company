#!/usr/bin/env bash
# PostToolUse.sh — Hook pós-execução de ferramenta para automação de commits.
# Se a tool for Edit ou Write e o projeto tiver a flag de auto-commit ativa,
# realiza um commit atômico contendo o identificador da Story/Task extraído da branch.

set -uo pipefail

# Lemos a entrada JSON do Claude Code via stdin
JSON_INPUT=$(cat)
TOOL_NAME=$(echo "$JSON_INPUT" | jq -r '.tool_name // empty')

# Só nos interessamos por edições ou escritas de arquivos
if [[ "$TOOL_NAME" != "Edit" && "$TOOL_NAME" != "Write" ]]; then
  exit 0
fi

CWD="${PWD:-$(pwd)}"
GIT_ROOT=$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null || echo "$CWD")

# Verifica se é repositório Git
if ! git -C "$GIT_ROOT" rev-parse --is-inside-work-tree &>/dev/null; then
  exit 0
fi

# Verifica se o auto-commit está ativado localmente
# Pode ser ativado criando o arquivo .claude/auto-commit ou via env var CLAUDE_AUTO_COMMIT=true
AUTO_COMMIT_FLAG="${GIT_ROOT}/.claude/auto-commit"
if [[ ! -f "$AUTO_COMMIT_FLAG" && "${CLAUDE_AUTO_COMMIT:-false}" != "true" ]]; then
  exit 0
fi

# Pega a branch atual
BRANCH=$(git -C "$GIT_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)

# Tenta extrair o identificador de task/story (ex: NM-123, STORY-003, feat/NM-123 -> NM-123)
# Busca por padrões de letras e números separados por hífen (ex: ABC-123)
TASK_ID=$(echo "$BRANCH" | grep -oE '[A-Za-z]+-[0-9]+' | head -n 1 || echo "")

if [[ -z "$TASK_ID" ]]; then
  # Se não achar padrão, tenta extrair o primeiro segmento significativo após o prefixo (ex: feat/minha-task -> minha-task)
  TASK_ID=$(echo "$BRANCH" | sed -E 's/^(feat|fix|chore|docs|refactor|test)\///' | cut -d'-' -f1-2)
fi

# Obtém o arquivo que foi modificado a partir do input da tool
MODIFIED_FILE=$(echo "$JSON_INPUT" | jq -r '.tool_input.AbsolutePath // .tool_input.TargetFile // empty')

if [[ -z "$MODIFIED_FILE" ]]; then
  exit 0
fi

# Verifica se o arquivo realmente tem alterações no git
RELATIVE_PATH=$(git -C "$GIT_ROOT" ls-files --full-name "$MODIFIED_FILE" 2>/dev/null || echo "")

if [[ -n "$RELATIVE_PATH" ]] && ! git -C "$GIT_ROOT" diff --quiet -- "$RELATIVE_PATH" 2>/dev/null; then
  # Mensagem de commit formatada
  FILE_BASENAME=$(basename "$MODIFIED_FILE")
  
  if [[ -n "$TASK_ID" ]]; then
    COMMIT_MSG="${TASK_ID}: update ${FILE_BASENAME} after tool execution"
  else
    COMMIT_MSG="chore: update ${FILE_BASENAME} after tool execution"
  fi
  
  # Adiciona e faz o commit
  git -C "$GIT_ROOT" add "$MODIFIED_FILE"
  if git -C "$GIT_ROOT" commit -m "$COMMIT_MSG" --no-verify &>/dev/null; then
    echo "✅ [PostToolUse] Auto-committed change in ${FILE_BASENAME} with message: '${COMMIT_MSG}'" >&2
  fi
fi

exit 0
