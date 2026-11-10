#!/usr/bin/env python3
"""Removes test blocks (describe/it/test) from a file, by the 1-based line each block starts on.
Used only to build start patches (tests that reveal a seeded bug are hidden from the agent and
restored for scoring). Usage: strip-blocks.py FILE LINE [LINE...]"""
import sys

def block_end(lines, start):
    depth, seen = 0, False
    in_str = None
    for i in range(start, len(lines)):
        line = lines[i]
        j = 0
        while j < len(line):
            ch = line[j]
            if in_str:
                if ch == '\\': j += 2; continue
                if ch == in_str: in_str = None
            elif ch in '\'"`': in_str = ch
            elif ch == '/' and line[j:j+2] == '//': break
            elif ch in '({': depth += 1; seen = True
            elif ch in ')}': depth -= 1
            j += 1
        if seen and depth == 0:
            return i
    raise SystemExit(f"no end for block at line {start+1}")

path, starts = sys.argv[1], sorted((int(x) - 1 for x in sys.argv[2:]), reverse=True)
lines = open(path).read().split('\n')
for s in starts:
    e = block_end(lines, s)
    del lines[s:e + 1]
open(path, 'w').write('\n'.join(lines))
