#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
##############################################################################
# Set up the implementation plan for a feature.
#
# Detects the current feature branch, verifies spec.md exists, and
# copies the plan template into the feature's specs directory.
#
# Usage:
#   setup-plan.sh [--json]
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

OUTPUT_JSON=false

function usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --json    Output JSON with file paths
  -h, --help  Show this help message
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

SPECS_DIR="${REPO_ROOT}/specs/${BRANCH}"
SPEC_FILE="${SPECS_DIR}/spec.md"
PLAN_FILE="${SPECS_DIR}/plan.md"

# Verify spec directory and spec.md exist
if [[ ! -d "${SPECS_DIR}" ]]; then
    error "Feature spec directory not found: ${SPECS_DIR}
Run create-new-feature.sh first to initialize the feature."
fi

if [[ ! -f "${SPEC_FILE}" ]]; then
    error "spec.md not found in ${SPECS_DIR}
Run create-new-feature.sh first to initialize the feature spec."
fi

# Copy plan template if plan.md doesn't already exist
if [[ ! -f "${PLAN_FILE}" ]]; then
    TEMPLATE_FILE="${REPO_ROOT}/.specify/templates/plan-template.md"
    if [[ -f "${TEMPLATE_FILE}" ]]; then
        cp "${TEMPLATE_FILE}" "${PLAN_FILE}"
    else
        # Create a minimal plan template
        cat > "${PLAN_FILE}" <<PLAN
# Implementation Plan: ${BRANCH}

## Active Technologies

- TODO: List key technologies

## Project Structure

\`\`\`
TODO: Outline relevant project structure
\`\`\`

## Commands

\`\`\`bash
# Build
# Test
# Lint
\`\`\`

## Implementation Phases

### Phase 1: Setup

- [ ] TODO: Define phase 1 tasks

### Phase 2: Core Implementation

- [ ] TODO: Define phase 2 tasks

### Phase 3: Testing & Polish

- [ ] TODO: Define phase 3 tasks

## Notes

Created on $(date -u +"%Y-%m-%d")
PLAN
    fi
    echo "Created plan: ${PLAN_FILE}" >&2
else
    echo "Plan already exists: ${PLAN_FILE}" >&2
fi

# Output results
if [[ "${OUTPUT_JSON}" == "true" ]]; then
    cat <<JSON
{
  "FEATURE_SPEC": "${SPEC_FILE}",
  "IMPL_PLAN": "${PLAN_FILE}",
  "SPECS_DIR": "${SPECS_DIR}",
  "BRANCH": "${BRANCH}"
}
JSON
else
    echo "Feature spec: ${SPEC_FILE}"
    echo "Implementation plan: ${PLAN_FILE}"
    echo "Specs directory: ${SPECS_DIR}"
    echo "Branch: ${BRANCH}"
fi
