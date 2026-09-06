#!/usr/bin/env bash
# Sequential per-book pipeline for the library-expansion run
# (planning/LIBRARY-EXPANSION.md, Lane O). Resumable: a book whose
# `.done` marker exists under drafts/.state/ is skipped; a failed step
# stops that book and moves on, leaving `.failed` with the step name.
#
# Usage: packages/content/scripts/expand-library.sh <bookId> [<bookId>...]
#        STEPS=assemble,build,fill,translate,rebuild,covers,narrate,words,validate (default all)
set -u
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
CONTENT="$ROOT/packages/content"
STATE="$CONTENT/drafts/.state"
mkdir -p "$STATE"
LOG="${LOG:-$ROOT/docs/evidence/library-expansion-2026-09-05.log}"
mkdir -p "$(dirname "$LOG")"
STEPS="${STEPS:-assemble,build,fill,translate,rebuild,covers,narrate,words,validate}"

log() { printf '%s %s\n' "$(date '+%H:%M:%S')" "$*" | tee -a "$LOG"; }
has_step() { case ",$STEPS," in *",$1,"*) return 0;; *) return 1;; esac; }

run_step() {
  local book="$1" step="$2"; shift 2
  has_step "$step" || return 0
  if [ -f "$STATE/$book.$step" ]; then log "[$book] $step: already done"; return 0; fi
  log "[$book] $step: start"
  local start=$SECONDS
  if "$@" >>"$LOG" 2>&1; then
    touch "$STATE/$book.$step"
    log "[$book] $step: ok ($((SECONDS-start))s)"
  else
    log "[$book] $step: FAILED ($((SECONDS-start))s), see $LOG"
    echo "$step" >"$STATE/$book.failed"
    return 1
  fi
}

tts_guard() {
  # Kokoro (ods-tts) has OOM-killed before; if /health is slow or down, restart it once.
  if ! curl -s -m 5 http://127.0.0.1:8880/health >/dev/null; then
    log "kokoro unhealthy, restarting ods-tts"
    docker restart ods-tts >/dev/null 2>&1 || true
    sleep 20
  fi
}

cd "$ROOT"
for book in "$@"; do
  if [ -f "$STATE/$book.done" ]; then log "[$book] done earlier, skipping"; continue; fi
  rm -f "$STATE/$book.failed"
  log "===== $book ====="
  run_step "$book" assemble node packages/content/scripts/assemble-draft.mjs "$book" || continue
  run_step "$book" build env SOTTO_LLM_BACKEND=deepseek pnpm content:build "$book" --fill || continue
  run_step "$book" fill node packages/content/scripts/fill-locales.mjs "--books=$book" --backend=deepseek || continue
  run_step "$book" translate env SOTTO_LLM_BACKEND=deepseek pnpm content:translate-sentences -- --book "$book" || continue
  run_step "$book" rebuild pnpm content:build "$book" || continue
  run_step "$book" covers pnpm content:covers || continue
  tts_guard
  run_step "$book" narrate pnpm content:narrate "$book" || continue
  tts_guard
  run_step "$book" words pnpm content:word-audio "$book" || continue
  run_step "$book" validate pnpm content:validate || continue
  touch "$STATE/$book.done"
  log "[$book] DONE"
done
log "batch finished: $*"
