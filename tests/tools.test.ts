import test from "node:test";
import assert from "node:assert/strict";
import { calculate, caesar, formatWords, wordCount } from "../src/lib/tools.ts";

test("calculator precedence, parentheses, unary and right-associative powers", () => {
  for (const [expression, value] of [
    ["2+3*4", 14],
    ["(24+18)*2", 84],
    ["2^3^2", 512],
    ["-2^2", -4],
    ["2^-2", 0.25],
    [".1+.2", 0.3],
    ["--4", 4],
  ] as const)
    assert.equal(calculate(expression), value);
});
test("calculator rejects malformed inputs, code execution, zero division and overflow", () => {
  for (const expression of [
    "",
    "1/0",
    "1+",
    "1..2",
    "(1+2",
    "2(3)",
    "process.exit()",
    "Infinity",
    "9^9999",
    "(".repeat(70) + "1" + ")".repeat(70),
    "1".repeat(513),
  ])
    assert.throws(() => calculate(expression), expression);
});
test("Caesar wraps both directions, roundtrips and preserves other characters", () => {
  assert.equal(caesar("Zebra! 123", 3), "Cheud! 123");
  assert.equal(caesar("Abc", -1), "Zab");
  assert.equal(caesar("Hello", 26), "Hello");
  assert.equal(caesar(caesar("Hello, café!", 19), -19), "Hello, café!");
  assert.throws(() => caesar("x", NaN));
  assert.throws(() => caesar("x", 0.5));
});
test("word formatting and Unicode-aware counting", () => {
  assert.equal(formatWords("hELLO. wORLD!", "sentence"), "Hello. World!");
  assert.equal(formatWords("élan and ENERGY", "title"), "Élan And Energy");
  assert.equal(formatWords("  a   b \n c  ", "trim"), "a b\nc");
  assert.equal(formatWords("aBc", "upper"), "ABC");
  assert.equal(formatWords("aBc", "lower"), "abc");
  assert.equal(wordCount("We don't lose café or state-of-the-art."), 6);
  assert.equal(wordCount(" \n"), 0);
});
