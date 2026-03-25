#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
##############################################################################
# Auto-update agent instructions from feature plans.
#
# Scans all specs/*/plan.md files and extracts Active Technologies,
# Project Structure, and Commands sections. Updates the target agent
# instructions file with aggregated data while preserving manual sections.
#
# Usage:
#   update-agent-context.sh <agent-name>
#   update-agent-context.sh copilot
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

function usage() {
    cat <<EOF
Usage: $(basename "$0") <agent-name>

Supported agents:
  copilot   Updates .github/copilot-instructions.md

The script scans all specs/*/plan.md files and aggregates:
  - Active Technologies
  - Project Structure
  - Commands
into the target agent instructions file.
EOF
    exit 0
}

function error() {
    echo "ERROR: $1" >&2
    exit 1
}

# Parse arguments
if [[ $# -lt 1 ]] || [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
    usage
fi

AGENT_NAME="$1"

# Determine target file based on agent name
case "${AGENT_NAME}" in
    copilot)
        TARGET_FILE="${REPO_ROOT}/.github/copilot-instructions.md"
        ;;
    *)
        error "Unsupported agent: '${AGENT_NAME}'. Currently supported: copilot"
        ;;
esac

if [[ ! -f "${TARGET_FILE}" ]]; then
    error "Target file not found: ${TARGET_FILE}"
fi

cd "${REPO_ROOT}"

# Collect all plan.md files
PLAN_FILES=()
if [[ -d "specs" ]]; then
    while IFS= read -r -d '' plan_file; do
        PLAN_FILES+=("${plan_file}")
    done < <(find specs -maxdepth 2 -name "plan.md" -print0 2>/dev/null | sort -z)
fi

if [[ ${#PLAN_FILES[@]} -eq 0 ]]; then
    echo "No plan.md files found in specs/. Nothing to update."
    exit 0
fi

# Extract a section from a markdown file by heading name
# Captures content between ## Heading and the next ## heading (or EOF)
function extract_section() {
    local file="$1"
    local heading="$2"
    local in_section=false
    local content=""

    while IFS= read -r line; do
        if [[ "${in_section}" == "true" ]]; then
            # Stop at next level-2 heading
            if [[ "${line}" =~ ^##[[:space:]] ]]; then
                break
            fi
            content+="${line}"$'\n'
        fi
        if [[ "${line}" =~ ^##[[:space:]]+"${heading}" ]] || [[ "${line}" =~ ^##[[:space:]]${heading} ]]; then
            in_section=true
        fi
    done < "${file}"

    # Trim leading/trailing blank lines
    echo "${content}" | sed '/^$/{ :a; N; /^\n*$/ba; }' | sed '/^[[:space:]]*$/d'
}

# Aggregate sections from all plan files
TECH_CONTENT=""
STRUCTURE_CONTENT=""
COMMANDS_CONTENT=""
RECENT_FEATURES=()

for plan_file in "${PLAN_FILES[@]}"; do
    feature_dir="$(dirname "${plan_file}")"
    feature_name="$(basename "${feature_dir}")"

    RECENT_FEATURES+=("${feature_name}")

    tech=$(extract_section "${plan_file}" "Active Technologies")
    if [[ -n "${tech}" ]]; then
        TECH_CONTENT+="### ${feature_name}"$'\n'"${tech}"$'\n'$'\n'
    fi

    structure=$(extract_section "${plan_file}" "Project Structure")
    if [[ -n "${structure}" ]]; then
        STRUCTURE_CONTENT+="### ${feature_name}"$'\n'"${structure}"$'\n'$'\n'
    fi

    commands=$(extract_section "${plan_file}" "Commands")
    if [[ -n "${commands}" ]]; then
        COMMANDS_CONTENT+="### ${feature_name}"$'\n'"${commands}"$'\n'$'\n'
    fi
done

# Get last 3 features for recent changes
RECENT_COUNT=${#RECENT_FEATURES[@]}
RECENT_START=0
if (( RECENT_COUNT > 3 )); then
    RECENT_START=$(( RECENT_COUNT - 3 ))
fi

RECENT_CHANGES=""
for (( i = RECENT_COUNT - 1; i >= RECENT_START; i-- )); do
    RECENT_CHANGES+="- ${RECENT_FEATURES[$i]}"$'\n'
done

TODAY=$(date -u +"%Y-%m-%d")

# Build the updated sections
UPDATED_SECTIONS=""

if [[ -n "${TECH_CONTENT}" ]]; then
    UPDATED_SECTIONS+="<!-- AUTO:TECHNOLOGIES START -->"$'\n'
    UPDATED_SECTIONS+="## Active Technologies"$'\n'$'\n'
    UPDATED_SECTIONS+="${TECH_CONTENT}"
    UPDATED_SECTIONS+="<!-- AUTO:TECHNOLOGIES END -->"$'\n'$'\n'
fi

if [[ -n "${STRUCTURE_CONTENT}" ]]; then
    UPDATED_SECTIONS+="<!-- AUTO:STRUCTURE START -->"$'\n'
    UPDATED_SECTIONS+="## Project Structure"$'\n'$'\n'
    UPDATED_SECTIONS+="${STRUCTURE_CONTENT}"
    UPDATED_SECTIONS+="<!-- AUTO:STRUCTURE END -->"$'\n'$'\n'
fi

if [[ -n "${COMMANDS_CONTENT}" ]]; then
    UPDATED_SECTIONS+="<!-- AUTO:COMMANDS START -->"$'\n'
    UPDATED_SECTIONS+="## Commands"$'\n'$'\n'
    UPDATED_SECTIONS+="${COMMANDS_CONTENT}"
    UPDATED_SECTIONS+="<!-- AUTO:COMMANDS END -->"$'\n'$'\n'
fi

UPDATED_SECTIONS+="<!-- AUTO:RECENT START -->"$'\n'
UPDATED_SECTIONS+="## Recent Changes"$'\n'$'\n'
UPDATED_SECTIONS+="${RECENT_CHANGES}"$'\n'
UPDATED_SECTIONS+="_Last updated: ${TODAY}_"$'\n'
UPDATED_SECTIONS+="<!-- AUTO:RECENT END -->"

# Read the existing target file
ORIGINAL_CONTENT=$(cat "${TARGET_FILE}")

# Function to replace content between auto markers, or append if not present
function replace_auto_section() {
    local content="$1"
    local start_marker="$2"
    local end_marker="$3"
    local replacement="$4"

    if grep -qF "${start_marker}" <<< "${content}"; then
        # Replace content between markers (inclusive)
        local before after
        before=$(awk "/${start_marker//\//\\/}/{found=1; exit} {print}" <<< "${content}")
        after=$(awk "BEGIN{found=0} /${end_marker//\//\\/}/{found=1; next} found{print}" <<< "${content}")
        echo "${before}"$'\n'"${replacement}"$'\n'"${after}"
    else
        # Append before manual additions or at end
        if grep -qF "<!-- MANUAL ADDITIONS START -->" <<< "${content}"; then
            local before_manual after_manual
            before_manual=$(awk '/<!-- MANUAL ADDITIONS START -->/{exit} {print}' <<< "${content}")
            after_manual=$(awk 'BEGIN{found=0} /<!-- MANUAL ADDITIONS START -->/{found=1} found{print}' <<< "${content}")
            echo "${before_manual}"$'\n'"${replacement}"$'\n'$'\n'"${after_manual}"
        else
            echo "${content}"$'\n'$'\n'"${replacement}"
        fi
    fi
}

RESULT="${ORIGINAL_CONTENT}"

# Replace each auto section
for section_type in TECHNOLOGIES STRUCTURE COMMANDS RECENT; do
    START_MARKER="<!-- AUTO:${section_type} START -->"
    END_MARKER="<!-- AUTO:${section_type} END -->"

    # Extract the relevant replacement block from UPDATED_SECTIONS
    SECTION_BLOCK=$(awk "/${START_MARKER//\//\\/}/{found=1} found{print} /${END_MARKER//\//\\/}/{found=0}" <<< "${UPDATED_SECTIONS}")

    if [[ -n "${SECTION_BLOCK}" ]]; then
        RESULT=$(replace_auto_section "${RESULT}" "${START_MARKER}" "${END_MARKER}" "${SECTION_BLOCK}")
    fi
done

# Write the updated file
echo "${RESULT}" > "${TARGET_FILE}"

# Report
echo "Updated: ${TARGET_FILE}"
echo "Scanned ${#PLAN_FILES[@]} plan file(s):"
for plan_file in "${PLAN_FILES[@]}"; do
    echo "  - ${plan_file}"
done
echo ""
echo "Sections updated:"
[[ -n "${TECH_CONTENT}" ]] && echo "  ✓ Active Technologies"
[[ -n "${STRUCTURE_CONTENT}" ]] && echo "  ✓ Project Structure"
[[ -n "${COMMANDS_CONTENT}" ]] && echo "  ✓ Commands"
echo "  ✓ Recent Changes (last ${#RECENT_FEATURES[@]} features)"
echo ""
echo "Last updated: ${TODAY}"
