#!/usr/bin/env bash
# PreCompact.sh — Hook executado antes da compactação de contexto.
# Salva o estado da sessão localmente para evitar perda de contexto.

set -uo pipefail

CWD="${PWD:-$(pwd)}"
GIT_ROOT=$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null || echo "$CWD")
PROJECT_NAME=$(basename "$GIT_ROOT")

STATE_FILE="${GIT_ROOT}/.claude/session_state.json"
mkdir -p "$(dirname "$STATE_FILE")"

# ─── 1. Coleta o estado do Git ────────────────────────────────────────────────
if git -C "$GIT_ROOT" rev-parse --is-inside-work-tree &>/dev/null; then
  BRANCH=$(git -C "$GIT_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)
  LAST_COMMIT=$(git -C "$GIT_ROOT" log -1 --oneline 2>/dev/null || echo "Nenhum commit ainda")
  MODIFIED_FILES=$(git -C "$GIT_ROOT" status --porcelain 2>/dev/null | awk '{print $2}' | paste -sd "," - || echo "Nenhum arquivo alterado")
else
  BRANCH="N/A (Não é um repositório git)"
  LAST_COMMIT="N/A"
  MODIFIED_FILES="N/A"
fi

# ─── 2. Coleta o status das Tarefas / Stories ───────────────────────────────
STATUS_SUMMARY=""
if [[ -f "${GIT_ROOT}/PROJECT_STATUS.md" ]]; then
  STATUS_SUMMARY=$(head -n 20 "${GIT_ROOT}/PROJECT_STATUS.md")
elif [[ -f "${GIT_ROOT}/STATUS.md" ]]; then
  STATUS_SUMMARY=$(head -n 20 "${GIT_ROOT}/STATUS.md")
fi

# ─── 3. Grava o arquivo de estado em JSON formatado ───────────────────────────
escaped_modified=$(echo "${MODIFIED_FILES}" | jq -R -s '.')
escaped_commit=$(echo "${LAST_COMMIT}" | jq -R -s '.')
escaped_branch=$(echo "${BRANCH}" | jq -R -s '.')
escaped_summary=$(echo "${STATUS_SUMMARY}" | jq -R -s '.')

cat <<EOF > "$STATE_FILE"
{
  "project": "${PROJECT_NAME}",
  "directory": "${CWD}",
  "branch": ${escaped_branch},
  "last_commit": ${escaped_commit},
  "modified_files": ${escaped_modified},
  "project_status_preview": ${escaped_summary},
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

# ─── 4. Retorna a decisão (JSON output) ───────────────────────────────────────
CONTEXT_MSG="O contexto da conversa foi compactado devido ao limite de tokens do Claude Code. 
Estado preservado antes da compactação:
- Projeto: ${PROJECT_NAME}
- Branch atual: ${BRANCH}
- Último commit: ${LAST_COMMIT}
- Arquivos modificados localmente: ${MODIFIED_FILES}
Por favor, considere esse estado preservado e continue o desenvolvimento a partir daí."

escaped_msg=$(echo "${CONTEXT_MSG}" | jq -R -s '.')

cat <<EOF
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PreCompact",
    "additionalContext": ${escaped_msg}
  }
}
EOF

exit 0
