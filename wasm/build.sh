#!/bin/sh

CLANG="${CLANG:-clang}"

${CLANG} --target=wasm32 --no-standard-libraries -g -Wl,--export-all -Wl,--no-entry -Wl,--import-undefined -Wl,--initial-memory=524288 -z stack-size=262144 -pedantic -Wall -Wextra -Werror -o ../pages/api/maze-c.wasm maze.c
cp ../pages/api/maze-c.wasm ../public/
