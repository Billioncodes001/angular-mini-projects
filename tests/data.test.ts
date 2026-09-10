import test from "node:test";
import assert from "node:assert/strict";
import {
  CleanupSession,
  LIMITS,
  diffData,
  formulaCount,
  formulaRisk,
  parseData,
  serializeData,
  transformData,
  type DataDocument,
  type DataFormat,
  type Operation,
} from "../src/lib/data.ts";

function parse(source: string, format: DataFormat = "csv"): DataDocument {
  const result = parseData(source, format);
  assert.deepEqual(result.issues, []);
  assert.ok(result.document);
  return result.document;
}
const options = (
  operation: Operation = "trim",
  header = true,
  column: number | null = null,
) => ({ operation, header, column });

test("CSV roundtrips BOM, escaped quotes, commas, multiline fields and mixed record endings", () => {
  const doc = parse(
    '\uFEFFname,note\r\nAda,"a,b and ""quote""\r\nnext"\nTayo,end\r',
  );
  assert.equal(doc.format, "csv");
  if (doc.format !== "csv") return;
  assert.deepEqual(doc.rows, [
    ["name", "note"],
    ["Ada", 'a,b and "quote"\r\nnext'],
    ["Tayo", "end"],
  ]);
  assert.deepEqual(doc.endings, ["\r\n", "\n", "\r"]);
  assert.deepEqual(parse(serializeData(doc)), doc);
});

test("CSV preserves empty cells, blank records and trailing record terminator semantics", () => {
  assert.equal(parseData("\uD800", "csv").document, undefined);
  assert.equal(parseData("\uDC00", "csv").document, undefined);
  assert.ok(parseData("\uD83D\uDE00", "csv").document);
  for (const source of [
    "\n",
    "\n\n",
    '""',
    '""\n""',
    "a,\n,\n",
    "a,",
    "a\n\n\n",
  ]) {
    const doc = parse(source);
    assert.deepEqual(parse(serializeData(doc)), doc, source);
  }
  const doc = parse("a\n\n");
  if (doc.format === "csv") assert.deepEqual(doc.rows, [["a"], [""]]);
});

test("CSV reports record and physical line errors without accepting partial input", () => {
  for (const source of [
    "a,b\nonly",
    "a,b\n\n",
    "a,b\nx,y,z",
    'a,b\nx,"unclosed',
    'a,b\nx,y"z',
    'a,b\nx,"y"oops',
  ]) {
    const result = parseData(source, "csv");
    assert.equal(result.document, undefined);
    assert.ok(result.issues.length);
    assert.equal(result.issues[0].record, 2);
    assert.ok(result.issues[0].line >= 2);
    assert.deepEqual(result.previewRows[0], ["a", "b"]);
  }
  const result = parseData('a,b\n"multi\nline",ok\nwrong', "csv");
  assert.equal(result.issues[0].line, 4);
  assert.equal(result.issues[0].record, 3);
});

test("CSV field width, value, record, UTF-8 byte and empty input limits are enforced", () => {
  for (const source of [
    "",
    "x".repeat(LIMITS.bytes + 1),
    "é".repeat(LIMITS.bytes / 2 + 1),
    Array(101).fill("a").join(","),
    Array(2001).fill("a").join("\n"),
    Array(201).fill(Array(100).fill("a").join(",")).join("\n"),
  ])
    assert.equal(parseData(source, "csv").document, undefined);
  assert.ok(parseData("x".repeat(LIMITS.bytes), "csv").document);
  assert.ok(parseData(Array(2000).fill("a").join("\n"), "csv").document);
});

test("JSON retains exact number tokens, all root types, object order and nested types", () => {
  for (const source of [
    "null",
    "false",
    "true",
    "1.2300e+55",
    "-0",
    "1e99999",
    "9007199254740993123456789",
    '" hi "',
    "[]",
    "{}",
    '{"10":1,"2":2,"empty":[],"b":[null,false," hi ",9007199254740993]}',
  ]) {
    const doc = parse(source, "json");
    assert.equal(serializeData(doc), source);
    assert.deepEqual(parse(serializeData(doc), "json"), doc);
  }
  assert.equal(
    serializeData(parse('\uFEFF {"a": 1} ', "json")),
    '\uFEFF{"a":1}',
  );
});

test("JSON refuses duplicate decoded keys instead of silently losing their values", () => {
  for (const source of [
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"nested":{"x":1,"x":2}}',
  ]) {
    const result = parseData(source, "json");
    assert.equal(result.document, undefined);
    assert.match(result.issues[0].message, /Duplicate/);
    assert.ok(result.issues[0].column > 1);
  }
});

test("JSON prototype-looking keys stay inert and survive transformation and comparison", () => {
  const source =
    '{"__proto__":{"polluted":" yes "},"constructor":{"prototype":" no "},"toString":" text "}';
  const before = parse(source, "json");
  const after = transformData(before, options());
  assert.equal(
    serializeData(after),
    '{"__proto__":{"polluted":"yes"},"constructor":{"prototype":"no"},"toString":"text"}',
  );
  assert.equal(({} as { polluted?: string }).polluted, undefined);
  assert.equal(diffData(before, after).changed, 3);
  assert.equal(serializeData(before), source);
});

test("JSON malformed syntax, escapes, non-JSON numbers, depth and value limits fail safely", () => {
  for (const source of [
    "",
    "undefined",
    "NaN",
    "Infinity",
    "01",
    "-01",
    "1.",
    "[1,]",
    '{"a":1,}',
    '{"a":}',
    "{} false",
    "/* hi */ {}",
    '"\\x41"',
    '"\n"',
    '"unfinished',
    '"\\uZZZZ"',
    "[".repeat(33) + "0" + "]".repeat(33),
    "[" + Array(20000).fill("0").join(",") + "]",
  ]) {
    const result = parseData(source, "json");
    assert.equal(result.document, undefined, source.slice(0, 70));
    assert.ok(result.issues[0].line >= 1);
  }
  assert.ok(parseData("[".repeat(32) + "0" + "]".repeat(32), "json").document);
});

test("CSV transformations honor header / column scope, strings and immutable original", () => {
  const before = parse(" Name , Note \r\n Ada ,  KEEP  \r\n Tayo ,  KEEP  ");
  const after = transformData(before, options("trim", true, 0));
  assert.equal(
    serializeData(after),
    " Name , Note \r\nAda,  KEEP  \r\nTayo,  KEEP  ",
  );
  assert.equal(diffData(before, after).changed, 2);
  assert.equal(
    serializeData(before),
    " Name , Note \r\n Ada ,  KEEP  \r\n Tayo ,  KEEP  ",
  );
  assert.throws(
    () => transformData(before, options("trim", true, 4)),
    /column/,
  );
});

test("JSON transforms only strings, including empty-key and array values", () => {
  const source =
    '{" KEY ":"  Hello  ","":false,"n":12345678901234567890,"a":[null,2,"  World  "]}';
  const before = parse(source, "json");
  const after = transformData(before, options("trim"));
  assert.equal(
    serializeData(after),
    '{" KEY ":"Hello","":false,"n":12345678901234567890,"a":[null,2,"World"]}',
  );
  assert.equal(diffData(before, after).changed, 2);
  assert.throws(() => transformData(before, options("guard")), /CSV/);
});

test("Each transformation has explicit, narrow semantics", () => {
  for (const [operation, input, expected] of [
    ["trim", " \t a \n ", "a"],
    ["spaces", " \t a\t\t b\r\nc ", " a b\r\nc "],
    ["newlines", "a\r\nb\rc\n", "a\nb\nc\n"],
    ["upper", "Straße", "STRASSE"],
    ["lower", "ÉLAN", "élan"],
  ] as const) {
    const result = transformData(
      parse(JSON.stringify(input), "json"),
      options(operation),
    );
    assert.equal(serializeData(result), JSON.stringify(expected));
  }
});

test("CSV formula detection includes whitespace, controls, fullwidth prefixes and headers", () => {
  for (const text of [
    "=1+1",
    " +SUM(A1)",
    "\ttext",
    "\rvalue",
    "-2",
    "@text",
    "＝1",
    "\u0000 =1",
  ])
    assert.equal(formulaRisk(text), true);
  for (const text of ["normal", "'=1", "1-2", "a@b", ""])
    assert.equal(formulaRisk(text), false);
  const doc = parse("=header,plain\n =1+1,@formula");
  assert.equal(formulaCount(doc), 3);
  assert.equal(formulaCount(transformData(doc, options("guard", true))), 1);
  const guarded = transformData(doc, options("guard", false));
  assert.equal(formulaCount(guarded), 0);
  assert.deepEqual(transformData(guarded, options("guard", false)), guarded);
  assert.equal(formulaCount(doc), 3);
});

test("Structured JSON diff distinguishes missing, null, empty, type changes and exact numbers", () => {
  const before = parse(
    '{"empty":"","nil":null,"a/b~c":1,"array":[1,2],"gone":{"a":1},"numeric":1.0}',
    "json",
  );
  const after = parse(
    '{"nil":"null","a/b~c":2,"array":[1,2,3],"added":{},"numeric":1}',
    "json",
  );
  const diff = diffData(before, after);
  assert.deepEqual([diff.added, diff.removed, diff.changed], [2, 2, 3]);
  assert.ok(diff.changes.some((change) => change.path === "/a~1b~0c"));
  assert.deepEqual(
    diff.changes.find((change) => change.path === "/empty"),
    { path: "/empty", kind: "removed", before: '""' },
  );
  assert.equal(
    diffData(parse('{"a":1,"b":2}', "json"), parse('{"b":2,"a":1}', "json"))
      .changes.length,
    0,
  );
  assert.equal(
    diffData(parse("false", "json"), parse("null", "json")).changed,
    1,
  );
});

test("CSV diff is positional, includes headers and reports additions/removals without dropping blank rows", () => {
  const diff = diffData(parse("header\na\n\n"), parse("HEADER\na\n"));
  assert.deepEqual(diff.changes, [
    {
      path: "Record 1 / column 1",
      kind: "changed",
      before: "header",
      after: "HEADER",
    },
    { path: "Record 3 / column 1", kind: "removed", before: "" },
  ]);
  assert.throws(() => diffData(parse("a"), parse("{}", "json")), /same format/);
});

test("Preview, apply, no-op, undo and reset preserve original and clear stale proposals", () => {
  const doc = parse(" Name \n Ada ");
  const session = new CleanupSession(doc);
  session.preview(options());
  assert.equal(session.current, doc);
  assert.equal(session.pending?.diff.changed, 1);
  assert.equal(session.apply(), true);
  assert.equal(session.history.length, 1);
  session.preview(options());
  assert.equal(session.apply(), false);
  assert.equal(session.history.length, 1);
  session.preview(options("upper"));
  session.undo();
  assert.equal(session.pending, undefined);
  assert.equal(session.current, doc);
  assert.equal(session.apply(), false);
  session.preview(options("lower"));
  session.apply();
  session.reset();
  assert.equal(session.current, doc);
  assert.equal(session.history.length, 0);
});

test("History and expanded-output bounds never partially apply", () => {
  const session = new CleanupSession(parse('"a"', "json"));
  for (let i = 0; i < 20; i++) {
    session.preview(options(i % 2 ? "lower" : "upper"));
    session.apply();
  }
  session.preview(options("upper"));
  assert.throws(() => session.apply(), /20-step/);
  assert.equal(session.history.length, 20);
  assert.equal(serializeData(session.current), '"a"');
  const expanding = new CleanupSession(
    parse(JSON.stringify("ΐ".repeat(100000)), "json"),
  );
  assert.throws(() => expanding.preview(options("upper")), /exceeds/);
  assert.equal(expanding.history.length, 0);
  assert.equal(expanding.pending, undefined);
});

test("Path amplification has an explicit diff bound and no partial result", () => {
  const key = "x".repeat(20000);
  const a = parse(JSON.stringify({ [key]: Array(101).fill("a") }), "json");
  const b = parse(JSON.stringify({ [key]: Array(101).fill("b") }), "json");
  assert.throws(() => diffData(a, b), /Diff exceeds/);
  const session = new CleanupSession(a);
  assert.throws(() => session.preview(options("upper")), /Diff exceeds/);
  assert.equal(session.pending, undefined);
  assert.equal(session.current, a);
});

test("Generated CSV and JSON fixtures roundtrip after each transformation", () => {
  const values = [
    "",
    " a ",
    "comma,",
    '"quoted"',
    "a\r\nb",
    "\t=1",
    "Élan",
    "<script>bad()</script>",
    "__proto__",
  ];
  for (let i = 0; i < 60; i++) {
    const rows = Array.from({ length: 3 }, (_, r) =>
      Array.from(
        { length: 3 },
        (_, c) => values[(i + r * 3 + c) % values.length],
      ),
    );
    const doc: DataDocument = {
      format: "csv",
      rows,
      endings: ["\r\n", "\n", i % 2 ? "" : "\r"],
      bom: i % 2 === 0,
    };
    for (const operation of [
      "trim",
      "spaces",
      "lower",
      "upper",
      "newlines",
      "guard",
    ] as const) {
      const transformed = transformData(doc, options(operation, false));
      assert.deepEqual(parse(serializeData(transformed)), transformed);
    }
    const json = parse(
      JSON.stringify({ rows, id: i, bool: !!(i % 2), nil: null }),
      "json",
    );
    assert.deepEqual(
      parse(serializeData(transformData(json, options("trim"))), "json"),
      transformData(json, options("trim")),
    );
  }
});
