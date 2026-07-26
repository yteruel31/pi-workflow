#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: spawn.sh --mode read-only|implementation --title TEXT --prompt-file PATH --cwd PATH [options]

Options:
  --workspace ID   Use a specific available Herdr workspace (default: focused, then first)

Implementation options (all required in implementation mode):
  --base COMMIT    Exact full commit ID for the new worktree
  --branch NAME    New local branch name
  --worktree PATH  Absolute path that does not already exist

  -h, --help       Show this help
EOF
}

fail_usage() {
  echo "$1" >&2
  usage >&2
  exit 2
}

require_value() {
  if [[ $# -lt 2 || -z "$2" ]]; then
    fail_usage "$1 requires a non-empty value"
  fi
}

mode=""
title=""
prompt_file=""
source_cwd=""
workspace_id=""
base=""
branch=""
worktree=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      require_value "$@"
      mode="$2"
      shift 2
      ;;
    --title)
      require_value "$@"
      title="$2"
      shift 2
      ;;
    --prompt-file)
      require_value "$@"
      prompt_file="$2"
      shift 2
      ;;
    --cwd)
      require_value "$@"
      source_cwd="$2"
      shift 2
      ;;
    --workspace)
      require_value "$@"
      workspace_id="$2"
      shift 2
      ;;
    --base)
      require_value "$@"
      base="$2"
      shift 2
      ;;
    --branch)
      require_value "$@"
      branch="$2"
      shift 2
      ;;
    --worktree)
      require_value "$@"
      worktree="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail_usage "Unknown argument: $1"
      ;;
  esac
done

case "$mode" in
  read-only|implementation) ;;
  "") fail_usage "--mode is required" ;;
  *) fail_usage "--mode must be read-only or implementation" ;;
esac
[[ -n "$title" ]] || fail_usage "--title is required"
[[ -n "$prompt_file" ]] || fail_usage "--prompt-file is required"
[[ -n "$source_cwd" ]] || fail_usage "--cwd is required"

if [[ "$mode" == "implementation" ]]; then
  [[ -n "$base" ]] || fail_usage "--base is required in implementation mode"
  [[ -n "$branch" ]] || fail_usage "--branch is required in implementation mode"
  [[ -n "$worktree" ]] || fail_usage "--worktree is required in implementation mode"
else
  if [[ -n "$base" || -n "$branch" || -n "$worktree" ]]; then
    fail_usage "--base, --branch, and --worktree are valid only in implementation mode"
  fi
fi

required_commands=(herdr pi python3)
if [[ "$mode" == "implementation" ]]; then
  required_commands+=(git)
fi
for command_name in "${required_commands[@]}"; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

if [[ ! -f "$prompt_file" ]]; then
  echo "--prompt-file must point to an existing regular file: $prompt_file" >&2
  exit 2
fi
if [[ ! -d "$source_cwd" ]]; then
  echo "--cwd must point to an existing directory: $source_cwd" >&2
  exit 2
fi
source_cwd="$(cd "$source_cwd" && pwd -P)"
prompt_file="$(cd "$(dirname "$prompt_file")" && pwd -P)/$(basename "$prompt_file")"

workspace_json="$(herdr workspace list)"
if ! workspace_id="$(python3 -c '
import json
import sys

requested = sys.argv[1]
try:
    payload = json.load(sys.stdin)
    workspaces = payload.get("result", {}).get("workspaces", [])
except (AttributeError, json.JSONDecodeError, TypeError):
    raise SystemExit(2)

if requested:
    selected = next((item for item in workspaces if item.get("workspace_id") == requested), None)
else:
    selected = next((item for item in workspaces if item.get("focused")), None)
    selected = selected or (workspaces[0] if workspaces else None)

if selected and selected.get("workspace_id"):
    print(selected["workspace_id"])
' "$workspace_id" <<<"$workspace_json")"; then
  echo "Invalid response from 'herdr workspace list'" >&2
  exit 1
fi
if [[ -z "$workspace_id" ]]; then
  echo "No requested or available Herdr workspace was found. Launch Herdr or choose an available workspace." >&2
  exit 1
fi

session_cwd="$source_cwd"
if [[ "$mode" == "implementation" ]]; then
  inside_work_tree="$(git -C "$source_cwd" rev-parse --is-inside-work-tree 2>/dev/null || true)"
  if [[ "$inside_work_tree" != "true" ]]; then
    echo "--cwd must be inside a Git working tree for implementation mode: $source_cwd" >&2
    exit 2
  fi
  if [[ ! "$base" =~ ^[0-9a-fA-F]{40}$ ]]; then
    echo "--base must be an exact full commit ID" >&2
    exit 2
  fi
  resolved_base="$(git -C "$source_cwd" rev-parse --verify "${base}^{commit}" 2>/dev/null || true)"
  if [[ -z "$resolved_base" || "${resolved_base,,}" != "${base,,}" ]]; then
    echo "--base is not an existing commit in the source repository: $base" >&2
    exit 2
  fi
  base="$resolved_base"
  if ! git check-ref-format --branch "$branch" >/dev/null 2>&1; then
    echo "--branch is not a valid branch name: $branch" >&2
    exit 2
  fi
  if git -C "$source_cwd" show-ref --verify --quiet "refs/heads/$branch"; then
    echo "--branch must be new; local branch already exists: $branch" >&2
    exit 2
  fi
  if [[ "$worktree" != /* ]]; then
    echo "--worktree must be an absolute path: $worktree" >&2
    exit 2
  fi
  if [[ -e "$worktree" || -L "$worktree" ]]; then
    echo "--worktree path must be new and not already exist: $worktree" >&2
    exit 2
  fi
  worktree_parent="$(dirname "$worktree")"
  if [[ ! -d "$worktree_parent" ]]; then
    echo "--worktree parent must be an existing directory: $worktree_parent" >&2
    exit 2
  fi

  dirty_parts=()
  if ! git -C "$source_cwd" diff --cached --quiet --; then
    dirty_parts+=(staged)
  fi
  if ! git -C "$source_cwd" diff --quiet --; then
    dirty_parts+=(unstaged)
  fi
  if [[ -n "$(git -C "$source_cwd" ls-files --others --exclude-standard)" ]]; then
    dirty_parts+=(untracked)
  fi
  if [[ ${#dirty_parts[@]} -gt 0 ]]; then
    printf -v dirty_kinds '%s, ' "${dirty_parts[@]}"
    dirty_kinds="${dirty_kinds%, }"
    echo "WARNING: source checkout has ${dirty_kinds} changes; source changes are allowed but are not copied into the HEAD-based worktree." >&2
  fi
  session_cwd="$worktree"
fi

scratch_root="${TMPDIR:-/tmp}/yt-dispatch-$(id -u)"
if [[ -L "$scratch_root" ]]; then
  echo "Unsafe scratch root symlink: $scratch_root" >&2
  exit 1
fi
install -d -m 700 "$scratch_root"
if [[ -L "$scratch_root" || ! -d "$scratch_root" || ! -O "$scratch_root" ]]; then
  echo "Scratch root is not a safe directory owned by the current user: $scratch_root" >&2
  exit 1
fi
chmod 700 "$scratch_root"

prompt_copy="$(mktemp "$scratch_root/prompt-XXXXXXXX.md")"
chmod 600 "$prompt_copy"
if [[ -L "$prompt_copy" || ! -f "$prompt_copy" || ! -O "$prompt_copy" ]]; then
  echo "Copied prompt path is not a safe file owned by the current user" >&2
  exit 1
fi
cp -- "$prompt_file" "$prompt_copy"
chmod 600 "$prompt_copy"

if [[ "$mode" == "implementation" ]]; then
  git -C "$source_cwd" worktree add -b "$branch" "$worktree" "$base" >/dev/null
fi

tab_json="$(herdr tab create --workspace "$workspace_id" --cwd "$session_cwd" --label "$title" --no-focus)"
if ! read -r tab_id pane_id < <(python3 -c '
import json, sys
try:
    result = json.load(sys.stdin).get("result", {})
    print(result["tab"]["tab_id"], result["root_pane"]["pane_id"])
except (KeyError, TypeError, AttributeError, json.JSONDecodeError):
    raise SystemExit(2)
' <<<"$tab_json"); then
  echo "Invalid response from 'herdr tab create'" >&2
  exit 1
fi

printf -v pi_command 'pi --name %q %q' "$title" "@$prompt_copy"
herdr pane run "$pane_id" "$pi_command" >/dev/null

json_args=("$workspace_id" "$tab_id" "$pane_id" "$title" "$mode" "$source_cwd" "$session_cwd" "$prompt_copy")
if [[ "$mode" == "implementation" ]]; then
  json_args+=("$base" "$branch" "$worktree")
fi
python3 - "${json_args[@]}" <<'PY'
import json
import sys

workspace_id, tab_id, pane_id, title, mode, source_cwd, session_cwd, prompt_path, *implementation = sys.argv[1:]
result = {
    "workspace_id": workspace_id,
    "tab_id": tab_id,
    "pane_id": pane_id,
    "title": title,
    "mode": mode,
    "source_cwd": source_cwd,
    "session_cwd": session_cwd,
    "prompt_path": prompt_path,
}
if implementation:
    result.update(zip(("base", "branch", "worktree"), implementation))
print(json.dumps(result, ensure_ascii=False, sort_keys=True))
PY
