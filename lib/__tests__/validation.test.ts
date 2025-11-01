import test from "node:test";
import assert from "node:assert/strict";

import { normalizeJa, matchAnswerToChoices } from "../validation";

test("normalizeJa converts width and collapses whitespace", () => {
  const input = " Ｔｅｓｔ　１２３  スペース";
  const output = normalizeJa(input);
  assert.strictEqual(output, "Test 123 スペース");
});

test("normalizeJa removes Japanese quotes and parenthetical content", () => {
  const input = "「引用」テキスト（別名）";
  const output = normalizeJa(input);
  assert.strictEqual(output, "引用テキスト");
});

test("normalizeJa normalizes hyphen variants and removes Japanese parentheses", () => {
  const input = "Ａ—１（テスト）";
  const output = normalizeJa(input);
  assert.strictEqual(output, "A-1");
});

test("matchAnswerToChoices matches ignoring parentheses and width", () => {
  const choices = ["アルファ（Alpha）", "ベータ"];
  const result = matchAnswerToChoices("アルファ", choices, 0);
  assert.equal(result.pass, true);
  assert.equal(result.hitIndex, 0);
  assert.match(result.reason, /一致インデックスOK/);
});

test("matchAnswerToChoices detects index mismatches", () => {
  const choices = ["アルファ（Alpha）", "ベータ"];
  const result = matchAnswerToChoices("アルファ", choices, 1);
  assert.equal(result.pass, false);
  assert.equal(result.hitIndex, 0);
  assert.match(result.reason, /インデックス不一致/);
});

test("matchAnswerToChoices reports missing matches", () => {
  const choices = ["アルファ（Alpha）", "ベータ"];
  const result = matchAnswerToChoices("ガンマ", choices);
  assert.equal(result.pass, false);
  assert.equal(result.hitIndex, -1);
  assert.strictEqual(result.reason, "選択肢に一致する回答なし");
});
