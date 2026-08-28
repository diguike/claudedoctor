#!/usr/bin/env bash
#
# Safely reset regenerable Claude caches without touching durable user data.
#
# Design choices:
# - An explicit allowlist prevents new or unknown Claude directories from being
#   removed accidentally.
# - Files are moved to a timestamped backup instead of being deleted.
# - Preview is the default; applying the reset requires --apply and confirmation.
# - The script refuses root/sudo so it cannot target the wrong home directory or
#   leave root-owned files in the user's profile.
# - Symlinked parent directories are rejected to keep every move inside the real
#   home directory selected at startup.
#
# Intentionally preserved:
# - skills, plugins, hooks, settings and credentials
# - conversations, projects, tasks, history, file-history and backups
# - Claude.app and Claude Desktop's Application Support/preferences
# - machine identity, Git configuration and shell profiles

set -euo pipefail

usage() {
    cat <<'EOF'
Usage:
  scripts/reset-claude-cache.sh              Preview the cache reset
  scripts/reset-claude-cache.sh --apply      Move caches after confirmation
  scripts/reset-claude-cache.sh --apply -y   Move caches without prompting

Options:
  --apply       Apply the reset. Without this flag, nothing is changed.
  -y, --yes     Skip the interactive confirmation (requires --apply).
  -h, --help    Show this help.

The moved files are kept under:
  ~/.claudedoctor-cleanup-backups/<timestamp>-<pid>-<random>/
EOF
}

apply=0
assume_yes=0

while [ "$#" -gt 0 ]; do
    case "$1" in
        --apply)
            apply=1
            ;;
        -y|--yes)
            assume_yes=1
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            printf 'Unknown option: %s\n\n' "$1" >&2
            usage >&2
            exit 64
            ;;
    esac
    shift
done

if [ "$assume_yes" -eq 1 ] && [ "$apply" -ne 1 ]; then
    printf 'Error: --yes is only valid together with --apply.\n' >&2
    exit 64
fi

if [ "$(id -u)" -eq 0 ] || [ -n "${SUDO_USER:-}" ]; then
    printf 'Error: run this script as your normal user, without sudo.\n' >&2
    exit 1
fi

user_home=${HOME:-}
if [ -z "$user_home" ] || [ ! -d "$user_home" ] || [ "$user_home" = "/" ]; then
    printf 'Error: HOME is missing or unsafe: %s\n' "${user_home:-<unset>}" >&2
    exit 1
fi

# Resolve a symlinked HOME once, then require every allowlisted target's parent
# hierarchy to consist of real directories. The target itself may be a symlink;
# mv will move that link, not its referent.
user_home=$(cd "$user_home" && pwd -P)
umask 077

reject_symlinked_parents() {
    local target=$1
    local parent
    local next
    parent=$(dirname "$target")
    while [ "$parent" != "$user_home" ]; do
        if [ -L "$parent" ]; then
            printf 'Error: refusing target with symlinked parent: %s -> %s\n' "$target" "$parent" >&2
            return 1
        fi
        next=$(dirname "$parent")
        if [ "$next" = "$parent" ]; then
            printf 'Error: target is not safely contained in HOME: %s\n' "$target" >&2
            return 1
        fi
        parent=$next
    done
}

sources=(
    "$user_home/.claude/cache"
    "$user_home/.claude/paste-cache"
    "$user_home/.claude/session-env"
    "$user_home/.claude/shell-snapshots"
    "$user_home/.claude/telemetry"
    "$user_home/.claude/stats-cache.json"
    "$user_home/.claude/mcp-needs-auth-cache.json"
)

# Each destination mirrors the path beneath HOME. Keeping the hierarchy avoids
# basename collisions and makes manual restoration straightforward.
destinations=(
    ".claude/cache"
    ".claude/paste-cache"
    ".claude/session-env"
    ".claude/shell-snapshots"
    ".claude/telemetry"
    ".claude/stats-cache.json"
    ".claude/mcp-needs-auth-cache.json"
)

if [ "$(uname -s)" = "Darwin" ]; then
    sources+=(
        "$user_home/Library/Caches/com.anthropic.claude"
        "$user_home/Library/Caches/Claude"
        "$user_home/Library/Logs/Claude"
        "$user_home/Library/Saved Application State/com.anthropic.claude.savedState"
    )
    destinations+=(
        "Library/Caches/com.anthropic.claude"
        "Library/Caches/Claude"
        "Library/Logs/Claude"
        "Library/Saved Application State/com.anthropic.claude.savedState"
    )
fi

existing_indexes=()
for ((i = 0; i < ${#sources[@]}; i++)); do
    if [ -e "${sources[$i]}" ] || [ -L "${sources[$i]}" ]; then
        reject_symlinked_parents "${sources[$i]}"
        existing_indexes+=("$i")
    fi
done

if [ "$apply" -eq 1 ]; then
    mode=apply
else
    mode=preview
fi
printf 'Claude cache reset (%s)\n\n' "$mode"
printf 'The following regenerable paths are in scope:\n'
if [ "${#existing_indexes[@]}" -eq 0 ]; then
    printf '  (none found)\n\nNothing to do.\n'
    exit 0
fi

for i in "${existing_indexes[@]}"; do
    printf '  %s\n' "${sources[$i]}"
done

cat <<'EOF'

Protected data is not in the allowlist: plugins, skills, hooks, settings,
credentials, conversations, projects, tasks, history, file-history and backups.
Quit Claude Code and Claude Desktop before applying so they cannot rewrite caches
while the reset is in progress.
EOF

if [ "$apply" -ne 1 ]; then
    printf '\nPreview only; no files were changed. Run again with --apply to continue.\n'
    exit 0
fi

if [ "$assume_yes" -ne 1 ]; then
    if [ ! -r /dev/tty ]; then
        printf '\nError: confirmation needs a terminal; use --apply --yes for automation.\n' >&2
        exit 1
    fi
    answer=""
    read -r -p $'\nType MOVE to place these paths in a recoverable backup: ' answer < /dev/tty
    if [ "$answer" != "MOVE" ]; then
        printf 'Cancelled; no files were changed.\n'
        exit 0
    fi
fi

backup_base="$user_home/.claudedoctor-cleanup-backups"
if [ -L "$backup_base" ]; then
    printf 'Error: backup directory must not be a symlink: %s\n' "$backup_base" >&2
    exit 1
fi
if [ -e "$backup_base" ] && [ ! -d "$backup_base" ]; then
    printf 'Error: backup path exists but is not a directory: %s\n' "$backup_base" >&2
    exit 1
fi
mkdir -p "$backup_base"
backup_dir=$(mktemp -d "$backup_base/$(date '+%Y%m%d-%H%M%S')-$$-XXXXXX")
manifest="$backup_dir/manifest.tsv"

printf 'status\tsource\tbackup\n' > "$manifest"

on_error() {
    local status=$?
    printf '\nReset stopped after a partial failure (exit %d).\n' "$status" >&2
    printf 'Inspect the journal before retrying or restoring: %s\n' "$manifest" >&2
    printf 'Moved entries remain recoverable under: %s\n' "$backup_dir" >&2
    exit "$status"
}
trap on_error ERR

moved=0
for i in "${existing_indexes[@]}"; do
    source_path=${sources[$i]}
    backup_path="$backup_dir/${destinations[$i]}"
    # Re-check immediately before each move to reduce the symlink race window.
    reject_symlinked_parents "$source_path"
    mkdir -p "$(dirname "$backup_path")"
    printf 'planned\t%s\t%s\n' "$source_path" "$backup_path" >> "$manifest"
    mv "$source_path" "$backup_path"
    printf 'moved\t%s\t%s\n' "$source_path" "$backup_path" >> "$manifest"
    printf 'Moved: %s\n' "$source_path"
    moved=$((moved + 1))
done

printf '\nReset complete: %d path(s) moved.\n' "$moved"
printf 'Backup: %s\n' "$backup_dir"
printf 'Manifest: %s\n' "$manifest"
printf 'Keep the backup until Claude has restarted and behaved normally.\n'
trap - ERR
