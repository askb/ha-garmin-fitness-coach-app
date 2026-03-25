#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
##############################################################################
# Validate required artifacts exist before an agent runs.
#
# Checks for spec.md, plan.md, tasks.md, data-model.md, research.md,
# quickstart.md, and contracts/ in the current feature's specs directory.
#
# Usage:
#   check-prerequisites.sh [--json] [--require-tasks] [--include-tasks]
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

OUTPUT_JSON=false
REQUIRE_TASKS=false
INCLUDE_TASKS=false

function usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --json            Output JSON with available/missing docs
  --require-tasks   Error if tasks.md does not exist
  --include-tasks   Include tasks.md content in output
  -h, --help        Show this help message
EOF
    exit 0
}

function error() {
    echo "ERROR: $1" >&2
    exit 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --json)
            OUTPUT_JSON=true
            shift
            ;;
        --require-tasks)
            REQUIRE_TASKS=true
            shift
            ;;
        --include-tasks)
            INCLUDE_TASKS=true
            shift
            ;;
        -h | --help)
            usage
            ;;
        *)
            error "Unknown argument: $1"
            ;;
    esac
done

cd "${REPO_ROOT}"

# Detect current branch
BRANCH="$(git branch --show-current 2>/dev/null)" || error "Not in a git repository"
[[ -z "${BRANCH}" ]] && error "Not on a named branch (detached HEAD?)"

# Validate branch matches NNN-feature-name pattern
if [[ ! "${BRANCH}" =~ ^[0-9]+-[a-zA-Z0-9].*$ ]]; then
    error "Current branch '${BRANCH}' does not match the expected pattern NNN-feature-name"
fi

FEATURE_DIR="${REPO_ROOT}/specs/${BRANCH}"

if [[ ! -d "${FEATURE_DIR}" ]]; then
    error "Feature directory not found: ${FEATURE_DIR}
Run create-new-feature.sh first to initialize the feature."
fi

# Define docs to check
KNOWN_DOCS=("spec.md" "plan.md" "tasks.md" "data-model.md" "research.md" "quickstart.md" "contracts/")

AVAILABLE_DOCS=()
MISSING_DOCS=()

for doc in "${KNOWN_DOCS[@]}"; do
    if [[ -e "${FEATURE_DIR}/${doc}" ]]; then
        AVAILABLE_DOCS+=("${doc}")
    else
        MISSING_DOCS+=("${doc}")
    fi
done

# Enforce --require-tasks
if [[ "${REQUIRE_TASKS}" == "true" ]] && [[ ! -f "${FEATURE_DIR}/tasks.md" ]]; then
    error "tasks.md is required but not found in ${FEATURE_DIR}"
fi

# Build JSON arrays
function json_array() {
    local arr=("$@")
    local result="["
    local first=true
    for item in "${arr[@]}"; do
        if [[ "${first}" == "true" ]]; then
            first=false
        else
            result+=", "
        fi
        result+="\"${item}\""
    done
    result+="]"
    echo "${result}"
}

AVAILABLE_JSON=$(json_array "${AVAILABLE_DOCS[@]+"${AVAILABLE_DOCS[@]}"}")
MISSING_JSON=$(json_array "${MISSING_DOCS[@]+"${MISSING_DOCS[@]}"}")

# Output results
if [[ "${OUTPUT_JSON}" == "true" ]]; then
    JSON_OUTPUT=$(cat <<JSON
{
  "FEATURE_DIR": "${FEATURE_DIR}",
  "AVAILABLE_DOCS": ${AVAILABLE_JSON},
  "MISSING_DOCS": ${MISSING_JSON},
  "BRANCH": "${BRANCH}"
JSON
)
    # Optionally include tasks content
    if [[ "${INCLUDE_TASKS}" == "true" ]] && [[ -f "${FEATURE_DIR}/tasks.md" ]]; then
        TASKS_CONTENT=$(sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' "${FEATURE_DIR}/tasks.md" | awk '{printf "%s\\n", $0}')
        JSON_OUTPUT+=$'\n'"  ,\"TASKS_CONTENT\": \"${TASKS_CONTENT}\""
    fi
    JSON_OUTPUT+=$'\n'"}"
    echo "${JSON_OUTPUT}"
else
    echo "Feature directory: ${FEATURE_DIR}"
    echo "Branch: ${BRANCH}"
    echo ""
    if [[ ${#AVAILABLE_DOCS[@]} -gt 0 ]]; then
        echo "Available docs:"
        for doc in "${AVAILABLE_DOCS[@]}"; do
            echo "  ✓ ${doc}"
        done
    fi
    echo ""
    if [[ ${#MISSING_DOCS[@]} -gt 0 ]]; then
        echo "Missing docs:"
        for doc in "${MISSING_DOCS[@]}"; do
            echo "  ✗ ${doc}"
        done
    fi
fi
