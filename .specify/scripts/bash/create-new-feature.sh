#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
##############################################################################
# Create a numbered feature branch and initialize the spec directory.
#
# Usage:
#   create-new-feature.sh [--json] [--number N] [--short-name "name"] "Feature description"
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

OUTPUT_JSON=false
FEATURE_NUMBER=""
SHORT_NAME=""
DESCRIPTION=""

function usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS] "Feature description"

Options:
  --json              Output JSON with BRANCH_NAME and SPEC_FILE paths
  --number N          Feature number (auto-detected if omitted)
  --short-name NAME   Short name for branch (auto-generated if omitted)
  -h, --help          Show this help message

If --number and --short-name are not provided, the script auto-detects
the next available feature number from remote/local branches and specs/.
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
        --number)
            [[ $# -lt 2 ]] && error "--number requires a value"
            FEATURE_NUMBER="$2"
            shift 2
            ;;
        --short-name)
            [[ $# -lt 2 ]] && error "--short-name requires a value"
            SHORT_NAME="$2"
            shift 2
            ;;
        -h | --help)
            usage
            ;;
        -*)
            error "Unknown option: $1"
            ;;
        *)
            DESCRIPTION="$1"
            shift
            ;;
    esac
done

[[ -z "${DESCRIPTION}" ]] && error "Feature description is required as a positional argument"

cd "${REPO_ROOT}"

# Auto-detect feature number and short name if not provided
if [[ -z "${FEATURE_NUMBER}" || -z "${SHORT_NAME}" ]]; then
    max_number=0

    # Fetch all remote branches
    git fetch --all --prune 2>/dev/null || true

    # Check remote branches for numbered feature pattern
    while IFS= read -r ref; do
        branch_name="${ref##*/}"
        if [[ "${branch_name}" =~ ^([0-9]+)- ]]; then
            num="${BASH_REMATCH[1]}"
            # Remove leading zeros for numeric comparison
            num=$((10#${num}))
            if (( num > max_number )); then
                max_number="${num}"
            fi
        fi
    done < <(git ls-remote --heads origin 2>/dev/null | awk '{print $2}' | grep -E "refs/heads/[0-9]+-" || true)

    # Check local branches
    while IFS= read -r branch_name; do
        if [[ "${branch_name}" =~ ^([0-9]+)- ]]; then
            num="${BASH_REMATCH[1]}"
            num=$((10#${num}))
            if (( num > max_number )); then
                max_number="${num}"
            fi
        fi
    done < <(git branch --format='%(refname:short)' 2>/dev/null | grep -E "^[0-9]+-" || true)

    # Check specs/ directories
    if [[ -d "specs" ]]; then
        for dir_entry in specs/[0-9]*-*/; do
            [[ -d "${dir_entry}" ]] || continue
            dir_name="$(basename "${dir_entry}")"
            if [[ "${dir_name}" =~ ^([0-9]+)- ]]; then
                num="${BASH_REMATCH[1]}"
                num=$((10#${num}))
                if (( num > max_number )); then
                    max_number="${num}"
                fi
            fi
        done
    fi

    # Increment for new feature
    if [[ -z "${FEATURE_NUMBER}" ]]; then
        FEATURE_NUMBER=$(( max_number + 1 ))
    fi

    # Auto-generate short name from description if not provided
    if [[ -z "${SHORT_NAME}" ]]; then
        SHORT_NAME=$(echo "${DESCRIPTION}" \
            | tr '[:upper:]' '[:lower:]' \
            | sed -E 's/[^a-z0-9]+/-/g' \
            | sed -E 's/^-+|-+$//g' \
            | cut -c1-50)
    fi
fi

# Zero-pad feature number to 3 digits
PADDED_NUMBER=$(printf "%03d" "${FEATURE_NUMBER}")
BRANCH_NAME="${PADDED_NUMBER}-${SHORT_NAME}"
FEATURE_DIR="${REPO_ROOT}/specs/${BRANCH_NAME}"
SPEC_FILE="${FEATURE_DIR}/spec.md"

# Create the feature branch
git checkout -b "${BRANCH_NAME}" 2>/dev/null || error "Failed to create branch '${BRANCH_NAME}'. It may already exist."

# Create the spec directory
mkdir -p "${FEATURE_DIR}"

# Copy spec template if it exists, otherwise create a minimal one
TEMPLATE_FILE="${REPO_ROOT}/.specify/templates/spec-template.md"
if [[ -f "${TEMPLATE_FILE}" ]]; then
    cp "${TEMPLATE_FILE}" "${SPEC_FILE}"
else
    cat > "${SPEC_FILE}" <<SPEC
# Feature ${PADDED_NUMBER}: ${DESCRIPTION}

## Overview

${DESCRIPTION}

## Requirements

- [ ] TODO: Define requirements

## Acceptance Criteria

- [ ] TODO: Define acceptance criteria

## Notes

Created on $(date -u +"%Y-%m-%d")
SPEC
fi

# Output results
if [[ "${OUTPUT_JSON}" == "true" ]]; then
    cat <<JSON
{
  "BRANCH_NAME": "${BRANCH_NAME}",
  "SPEC_FILE": "${SPEC_FILE}",
  "FEATURE_DIR": "${FEATURE_DIR}"
}
JSON
else
    echo "Feature branch created: ${BRANCH_NAME}"
    echo "Spec directory: ${FEATURE_DIR}"
    echo "Spec file: ${SPEC_FILE}"
fi
