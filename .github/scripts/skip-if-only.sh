#!/usr/bin/env bash
# Decides whether a workflow's gates can be skipped. Writes skip=true|false to
# $GITHUB_OUTPUT.
#
# Usage: skip-if-only.sh <extended-regex>
#
# On a pull request, skip=true only when every changed file matches the regex
# (paths that cannot affect this workflow's gates). Everything else is
# skip=false: pushes to main, manual runs, any file outside the regex, and any
# trouble working out the diff, so the full set always runs before a release.
#
# The PR checkout is a merge commit, so HEAD^1 is the tip of the base branch
# and `git diff HEAD^1 HEAD` is exactly what the PR changes.
set -euo pipefail

emit() { echo "skip=$1" >> "${GITHUB_OUTPUT:-/dev/stdout}"; echo "skip=$1 ($2)"; }

if [ "${EVENT_NAME:-}" != "pull_request" ]; then
  emit false "not a pull request; running everything"
  exit 0
fi

if ! files=$(git diff --name-only HEAD^1 HEAD); then
  emit false "could not diff; running everything"
  exit 0
fi

if [ -z "$files" ]; then
  emit false "empty diff; running everything"
  exit 0
fi

echo "Changed files:"; echo "$files"
if other=$(echo "$files" | grep -Ev "$1"); then
  emit false "needs the gates, e.g. $(echo "$other" | head -n 1)"
else
  emit true "only paths this workflow does not cover"
fi
