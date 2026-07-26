#!/usr/bin/env bash
set -euo pipefail

usage() { cat <<'EOF'
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
fail_usage() { echo "$1" >&2; usage >&2; exit 2; }
require_value() { [[ $# -ge 2 && -n "$2" ]] || fail_usage "$1 requires a non-empty value"; }

mode="" title="" prompt_file="" source_cwd="" workspace_id="" base="" branch="" worktree=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) require_value "$@"; mode="$2"; shift 2;;
    --title) require_value "$@"; title="$2"; shift 2;;
    --prompt-file) require_value "$@"; prompt_file="$2"; shift 2;;
    --cwd) require_value "$@"; source_cwd="$2"; shift 2;;
    --workspace) require_value "$@"; workspace_id="$2"; shift 2;;
    --base) require_value "$@"; base="$2"; shift 2;;
    --branch) require_value "$@"; branch="$2"; shift 2;;
    --worktree) require_value "$@"; worktree="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) fail_usage "Unknown argument: $1";;
  esac
done
case "$mode" in read-only|implementation);; "") fail_usage "--mode is required";; *) fail_usage "--mode must be read-only or implementation";; esac
[[ -n "$title" ]] || fail_usage "--title is required"
[[ -n "$prompt_file" ]] || fail_usage "--prompt-file is required"
[[ -n "$source_cwd" ]] || fail_usage "--cwd is required"
if [[ "$mode" == implementation ]]; then
  [[ -n "$base" ]] || fail_usage "--base is required in implementation mode"
  [[ -n "$branch" ]] || fail_usage "--branch is required in implementation mode"
  [[ -n "$worktree" ]] || fail_usage "--worktree is required in implementation mode"
elif [[ -n "$base$branch$worktree" ]]; then fail_usage "--base, --branch, and --worktree are valid only in implementation mode"; fi

required_commands=(herdr pi python3); [[ "$mode" == implementation ]] && required_commands+=(git)
for name in "${required_commands[@]}"; do command -v "$name" >/dev/null 2>&1 || { echo "Missing required command: $name" >&2; exit 1; }; done
[[ -f "$prompt_file" ]] || { echo "--prompt-file must point to an existing regular file: $prompt_file" >&2; exit 2; }
[[ -d "$source_cwd" ]] || { echo "--cwd must point to an existing directory: $source_cwd" >&2; exit 2; }
source_cwd="$(cd "$source_cwd" && pwd -P)"; prompt_file="$(cd "$(dirname "$prompt_file")" && pwd -P)/$(basename "$prompt_file")"

workspace_json="$(herdr workspace list)"
if ! workspace_id="$(python3 -c 'import json,sys
requested=sys.argv[1]
try: ws=json.load(sys.stdin).get("result",{}).get("workspaces",[])
except (AttributeError,json.JSONDecodeError,TypeError): raise SystemExit(2)
x=next((v for v in ws if v.get("workspace_id")==requested),None) if requested else next((v for v in ws if v.get("focused")),None) or (ws[0] if ws else None)
if x and x.get("workspace_id"): print(x["workspace_id"])' "$workspace_id" <<<"$workspace_json")"; then echo "Invalid response from 'herdr workspace list'" >&2; exit 1; fi
[[ -n "$workspace_id" ]] || { echo "No requested or available Herdr workspace was found. Launch Herdr or choose an available workspace." >&2; exit 1; }

session_cwd="$source_cwd"
if [[ "$mode" == implementation ]]; then
  [[ "$(git -C "$source_cwd" rev-parse --is-inside-work-tree 2>/dev/null || true)" == true ]] || { echo "--cwd must be inside a Git working tree for implementation mode: $source_cwd" >&2; exit 2; }
  source_top="$(cd "$(git -C "$source_cwd" rev-parse --show-toplevel)" && pwd -P)"
  [[ "$base" =~ ^[0-9a-fA-F]+$ ]] || { echo "--base must be an exact full commit ID" >&2; exit 2; }
  resolved_base="$(git -C "$source_cwd" rev-parse --verify "${base}^{commit}" 2>/dev/null || true)"
  [[ -n "$resolved_base" && "${resolved_base,,}" == "${base,,}" ]] || { echo "--base is not an existing exact full commit ID in the source repository: $base" >&2; exit 2; }
  base="$resolved_base"
  git check-ref-format --branch "$branch" >/dev/null 2>&1 || { echo "--branch is not a valid branch name: $branch" >&2; exit 2; }
  ! git -C "$source_cwd" show-ref --verify --quiet "refs/heads/$branch" || { echo "--branch must be new; local branch already exists: $branch" >&2; exit 2; }
  [[ "$worktree" == /* ]] || { echo "--worktree must be an absolute path: $worktree" >&2; exit 2; }
  [[ ! -e "$worktree" && ! -L "$worktree" ]] || { echo "--worktree path must be new and not already exist: $worktree" >&2; exit 2; }
  worktree_parent="$(dirname "$worktree")"; [[ -d "$worktree_parent" ]] || { echo "--worktree parent must be an existing directory: $worktree_parent" >&2; exit 2; }
  parent_abs="$(python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "$worktree_parent")"; parent_phys="$(cd "$worktree_parent" && pwd -P)"
  [[ "$parent_abs" == "$parent_phys" ]] || { echo "--worktree parent must not use symlinks: $worktree_parent" >&2; exit 2; }
  target_phys="$parent_phys/$(basename "$worktree")"
  common_dir="$(git -C "$source_cwd" rev-parse --git-common-dir)"; [[ "$common_dir" == /* ]] || common_dir="$source_top/$common_dir"; common_dir="$(cd "$common_dir" && pwd -P)"
  unsafe_roots=("$source_top" "$common_dir")
  while IFS= read -r registered; do [[ -n "$registered" ]] && unsafe_roots+=("$(cd "$registered" && pwd -P)"); done < <(git -C "$source_cwd" worktree list --porcelain | sed -n 's/^worktree //p')
  for root_path in "${unsafe_roots[@]}"; do
    if [[ "$target_phys" == "$root_path" || "$target_phys" == "$root_path/"* ]]; then echo "--worktree target must not equal or be nested beneath a repository or registered worktree: $target_phys" >&2; exit 2; fi
  done
  dirty_parts=(); git -C "$source_cwd" diff --cached --quiet -- || dirty_parts+=(staged); git -C "$source_cwd" diff --quiet -- || dirty_parts+=(unstaged); [[ -z "$(git -C "$source_cwd" ls-files --others --exclude-standard)" ]] || dirty_parts+=(untracked)
  if [[ ${#dirty_parts[@]} -gt 0 ]]; then printf -v kinds '%s, ' "${dirty_parts[@]}"; echo "WARNING: source checkout has ${kinds%, } changes; source changes are allowed but are not copied into the HEAD-based worktree." >&2; fi
  worktree="$target_phys"; session_cwd="$worktree"
fi

prompt_copy="" prompt_retained=false worktree_retained=false branch_retained=false tab_retained=false pi_started=false tab_id="" pane_id=""
emit() { python3 - "$@" <<'PY'
import json,sys
status,stage,message,workspace,tab,pane,title,mode,source,cwd,prompt,prompt_kept,base,branch,worktree,branch_kept,worktree_kept,tab_kept,pi_started,*observed=sys.argv[1:]
d={"status":status,"stage":stage,"message":message,"workspace_id":workspace or None,"tab_id":tab or None,"pane_id":pane or None,"title":title,"mode":mode,"source_cwd":source,"session_cwd":cwd,"prompt_path":prompt or None,"prompt_retained":prompt_kept=="true","base":base or None,"branch":branch or None,"worktree":worktree or None,"branch_retained":branch_kept=="true","worktree_retained":worktree_kept=="true","tab_retained":tab_kept=="true","pi_started":pi_started=="true"}
if observed: d["observed"]={"tab_workspace_id":observed[0],"tab_label":observed[1],"pane_id":observed[2],"pane_tab_id":observed[3],"pane_workspace_id":observed[4],"pane_cwd":observed[5]}
print(json.dumps(d,ensure_ascii=False,sort_keys=True))
PY
}
fail_resource() { local code="$1" stage="$2" message="$3"; shift 3; echo "$message" >&2; emit failure "$stage" "$message" "$workspace_id" "$tab_id" "$pane_id" "$title" "$mode" "$source_cwd" "$session_cwd" "$prompt_copy" "$prompt_retained" "$base" "$branch" "$worktree" "$branch_retained" "$worktree_retained" "$tab_retained" "$pi_started" "$@"; exit "$code"; }

scratch_root="${TMPDIR:-/tmp}/yt-dispatch-$(id -u)"
[[ ! -L "$scratch_root" ]] || { echo "Unsafe scratch root symlink: $scratch_root" >&2; exit 1; }
install -d -m 700 "$scratch_root"; [[ ! -L "$scratch_root" && -d "$scratch_root" && -O "$scratch_root" ]] || { echo "Scratch root is not a safe directory owned by the current user: $scratch_root" >&2; exit 1; }; chmod 700 "$scratch_root"
prompt_copy="$(mktemp "$scratch_root/prompt-XXXXXXXX.md")"; prompt_retained=true; chmod 600 "$prompt_copy"
[[ ! -L "$prompt_copy" && -f "$prompt_copy" && -O "$prompt_copy" ]] || fail_resource 1 prompt-copy "Copied prompt path is not a safe file owned by the current user"
cp -- "$prompt_file" "$prompt_copy" || fail_resource 1 prompt-copy "Failed to copy dispatch prompt"; chmod 600 "$prompt_copy"
if [[ "$mode" == implementation ]]; then
  if git -c core.hooksPath=/dev/null -C "$source_cwd" worktree add -b "$branch" "$worktree" "$base" >/dev/null; then branch_retained=true; worktree_retained=true; else fail_resource 1 worktree-add "Failed to create implementation branch/worktree"; fi
fi
if tab_json="$(herdr tab create --workspace "$workspace_id" --cwd "$session_cwd" --label "$title" --no-focus)"; then :; else code=$?; fail_resource "$code" tab-create "Failed to create Herdr tab"; fi
if ! ids="$(python3 -c 'import json,sys
try:
 r=json.load(sys.stdin)["result"]; print(r["tab"]["tab_id"],r["root_pane"]["pane_id"])
except (KeyError,TypeError,json.JSONDecodeError): raise SystemExit(2)' <<<"$tab_json")"; then fail_resource 1 tab-response "Invalid response from 'herdr tab create'"; fi
read -r tab_id pane_id <<<"$ids"; tab_retained=true
if ! tab_get="$(herdr tab get "$tab_id")"; then fail_resource 1 tab-observation "Failed to observe created Herdr tab"; fi
if ! pane_get="$(herdr pane get "$pane_id")"; then fail_resource 1 pane-observation "Failed to observe created Herdr pane"; fi
if ! observed="$(python3 -c 'import json,sys
def result(s): return json.loads(s).get("result",{})
t=result(sys.argv[1]); p=result(sys.argv[2]); t=t.get("tab",t); p=p.get("pane",p)
vals=[t.get("workspace_id"),t.get("label"),p.get("pane_id"),p.get("tab_id"),p.get("workspace_id"),p.get("cwd")]
if not all(isinstance(x,str) and x for x in vals): raise SystemExit(2)
print("\t".join(vals))' "$tab_get" "$pane_get")"; then fail_resource 1 observation-response "Invalid response while observing created Herdr resources"; fi
IFS=$'\t' read -r otw otl opi opt opw opc <<<"$observed"
obs=("$otw" "$otl" "$opi" "$opt" "$opw" "$opc")
if [[ "$otw" != "$workspace_id" || "$otl" != "$title" || "$opi" != "$pane_id" || "$opt" != "$tab_id" || "$opw" != "$workspace_id" || "$opc" != "$session_cwd" ]]; then fail_resource 1 observed-mismatch "Observed Herdr tab/pane does not match confirmed launch values" "${obs[@]}"; fi
if [[ "$mode" == read-only ]]; then printf -v pi_command 'pi --tools %q --name %q %q' 'read,grep,find,ls' "$title" "@$prompt_copy"; else printf -v pi_command 'pi --name %q %q' "$title" "@$prompt_copy"; fi
if ! herdr pane run "$pane_id" "$pi_command" >/dev/null; then fail_resource 1 pane-run "Failed to launch Pi in created Herdr pane" "${obs[@]}"; fi
pi_started=true
emit success complete "Pi launched" "$workspace_id" "$tab_id" "$pane_id" "$title" "$mode" "$source_cwd" "$session_cwd" "$prompt_copy" "$prompt_retained" "$base" "$branch" "$worktree" "$branch_retained" "$worktree_retained" "$tab_retained" "$pi_started" "${obs[@]}"
