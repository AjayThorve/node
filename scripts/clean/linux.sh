#!/usr/bin/env bash

set -Eeo pipefail

echo "cleaning rapids-js"

if [[ ! -d node_modules || ! -d node_modules/lerna || ! -d node_modules/rimraf ]]; then
    yarn --silent --non-interactive --no-node-version-check --ignore-engines;
fi

# clean modules/*/build dirs
lerna run --no-bail clean || true;
lerna clean --loglevel error --yes || true;
rimraf yarn.lock build node_modules compile_commands.json
