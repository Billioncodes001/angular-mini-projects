export const LIMITS = {
  bytes: 262144,
  rows: 2000,
  columns: 100,
  values: 20000,
  depth: 32,
  history: 20,
  diffUnits: 2000000,
};
export type DataFormat = "csv" | "json";
export type JsonNode =
  | { kind: "string"; value: string }
  | { kind: "number"; raw: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "null" }
  | { kind: "array"; items: JsonNode[] }
  | { kind: "object"; entries: [string, JsonNode][] };
export type CsvDocument = {
  format: "csv";
  rows: string[][];
  endings: string[];
  bom: boolean;
};
export type JsonDocument = { format: "json"; root: JsonNode; bom: boolean };
export type DataDocument = CsvDocument | JsonDocument;
export type Issue = {
  message: string;
  line: number;
  column: number;
  record?: number;
};
export type ParseResult = {
  document?: DataDocument;
  issues: Issue[];
  previewRows: string[][];
};
export type Change = {
  path: string;
  kind: "added" | "removed" | "changed";
  before?: string;
  after?: string;
};
export type Difference = {
  changes: Change[];
  added: number;
  removed: number;
  changed: number;
};
export type Operation =
  "trim" | "spaces" | "lower" | "upper" | "newlines" | "guard";
export type TransformOptions = {
  operation: Operation;
  header: boolean;
  column: number | null;
};

export function assertSize(text: string): void {
  if (
    text.length > LIMITS.bytes ||
    new TextEncoder().encode(text).length > LIMITS.bytes
  )
    throw new Error(
      "Input exceeds 256 KiB. Split it into smaller files; nothing was imported.",
    );
}

class ParseFailure extends Error {
  constructor(public issue: Issue) {
    super(issue.message);
  }
}

export function parseData(source: string, format: DataFormat): ParseResult {
  try {
    assertSize(source);
  } catch (error) {
    return {
      issues: [{ message: (error as Error).message, line: 1, column: 1 }],
      previewRows: [],
    };
  }
  // Blob UTF-8 encoding replaces lone surrogates; reject them instead of losing data.
  if (/[\uD800-\uDFFF]/u.test(source))
    return {
      issues: [
        {
          message: "Input contains an unpaired Unicode surrogate. Correct it before exporting as UTF-8.",
          line: 1,
          column: 1,
        },
      ],
      previewRows: [],
    };
  const bom = source.startsWith("\uFEFF");
  const text = bom ? source.slice(1) : source;
  if (format === "csv") return parseCsv(text, bom);
  try {
    return {
      document: { format, root: parseJson(text), bom },
      issues: [],
      previewRows: [],
    };
  } catch (error) {
    if (!(error instanceof ParseFailure)) throw error;
    return { issues: [error.issue], previewRows: [] };
  }
}

function parseCsv(text: string, bom: boolean): ParseResult {
  const rows: string[][] = [],
    endings: string[] = [],
    issues: Issue[] = [];
  let row: string[] = [],
    cell = "",
    state: "start" | "plain" | "quoted" | "closed" = "start";
  let line = 1,
    column = 1,
    recordLine = 1,
    values = 0;
  const fail = (message: string): never => {
    throw new ParseFailure({ message, line, column, record: rows.length + 1 });
  };
  const finishCell = () => {
    if (row.length >= LIMITS.columns) fail("CSV exceeds 100 columns.");
    if (++values > LIMITS.values) fail("CSV exceeds 20,000 cells.");
    row.push(cell);
    cell = "";
    state = "start";
  };
  const finishRow = (ending: string) => {
    finishCell();
    if (rows.length >= LIMITS.rows) fail("CSV exceeds 2,000 records.");
    if (rows.length && row.length !== rows[0].length && issues.length < 100)
      issues.push({
        message: `Expected ${rows[0].length} columns; found ${row.length}. Correct this record before cleanup.`,
        line: recordLine,
        column: 1,
        record: rows.length + 1,
      });
    rows.push(row);
    endings.push(ending);
    row = [];
  };
  try {
    if (!text) fail("CSV is empty. Add at least one record.");
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const newline = char === "\r" || char === "\n";
      const pair = char === "\r" && text[i + 1] === "\n";
      if (state === "quoted") {
        if (char === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i++;
            column++;
          } else state = "closed";
        } else {
          cell += char;
          if (pair) {
            cell += "\n";
            i++;
          }
        }
      } else if (char === ",") finishCell();
      else if (newline) {
        finishRow(pair ? "\r\n" : char);
        if (pair) i++;
        recordLine = line + 1;
      } else if (char === '"' && state === "start") state = "quoted";
      else {
        if (state === "closed")
          fail(
            "Unexpected text after a closing quote. Use a comma or record ending.",
          );
        if (char === '"')
          fail(
            "A quote inside an unquoted field must be escaped in a quoted field.",
          );
        cell += char;
        state = "plain";
      }
      if (newline) {
        line++;
        column = 1;
      } else column++;
    }
    if (state === "quoted")
      fail("Unclosed quoted field. No incomplete record was imported.");
    if (row.length || cell || state !== "start") finishRow("");
    return {
      document: issues.length
        ? undefined
        : { format: "csv", rows, endings, bom },
      issues,
      previewRows: rows.slice(0, 8),
    };
  } catch (error) {
    if (!(error instanceof ParseFailure)) throw error;
    return { issues: [...issues, error.issue], previewRows: rows.slice(0, 8) };
  }
}

// Entries, not user-keyed objects, make __proto__/constructor ordinary inert keys.
// Number tokens stay textual so large integers and decimal precision never round.
function parseJson(text: string): JsonNode {
  let index = 0,
    values = 0;
  const fail = (message: string): never => {
    const prefix = text.slice(0, index).split(/\r\n|\r|\n/);
    throw new ParseFailure({
      message,
      line: prefix.length,
      column: prefix.at(-1)!.length + 1,
    });
  };
  const whitespace = () => {
    while (/[\x20\t\n\r]/.test(text[index] ?? "x")) index++;
  };
  const string = (): string => {
    const start = index++;
    while (index < text.length) {
      const char = text[index++];
      if (char === '"') {
        try {
          return JSON.parse(text.slice(start, index)) as string;
        } catch {
          return fail("Invalid JSON string or escape sequence.");
        }
      }
      if (char === "\\") index++;
      else if (char.charCodeAt(0) < 32)
        return fail("Control characters in JSON strings must be escaped.");
    }
    return fail("Unclosed JSON string.");
  };
  const value = (depth: number): JsonNode => {
    whitespace();
    if (++values > LIMITS.values) fail("JSON exceeds 20,000 values.");
    const char = text[index];
    if (char === '"') return { kind: "string", value: string() };
    if (char === "{" || char === "[") {
      if (depth >= LIMITS.depth) fail("JSON exceeds 32 nesting levels.");
      const object = char === "{";
      const close = object ? "}" : "]";
      const entries: [string, JsonNode][] = [],
        items: JsonNode[] = [],
        keys = new Set<string>();
      index++;
      whitespace();
      if (text[index] === close) {
        index++;
        return object ? { kind: "object", entries } : { kind: "array", items };
      }
      while (index < text.length) {
        if (object) {
          if (text[index] !== '"') fail("Expected a quoted object key.");
          const key = string();
          if (keys.has(key))
            fail(
              `Duplicate object key ${JSON.stringify(key.slice(0, 80))}. Resolve it explicitly; no value was discarded.`,
            );
          keys.add(key);
          whitespace();
          if (text[index++] !== ":")
            fail("Expected a colon after the object key.");
          entries.push([key, value(depth + 1)]);
        } else items.push(value(depth + 1));
        whitespace();
        if (text[index] === close) {
          index++;
          return object
            ? { kind: "object", entries }
            : { kind: "array", items };
        }
        if (text[index++] !== ",") fail(`Expected a comma or ${close}.`);
        whitespace();
      }
      return fail(`Missing closing ${close}.`);
    }
    for (const token of ["true", "false", "null"])
      if (text.startsWith(token, index)) {
        index += token.length;
        return token === "null"
          ? { kind: "null" }
          : { kind: "boolean", value: token === "true" };
      }
    const number = text
      .slice(index)
      .match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (number) {
      index += number[0].length;
      return { kind: "number", raw: number[0] };
    }
    return fail(
      "Expected a JSON value. Comments, trailing commas and JavaScript are not JSON.",
    );
  };
  const root = value(0);
  whitespace();
  if (index !== text.length) fail("Unexpected content after a JSON value.");
  return root;
}

export function serializeNode(
  node: JsonNode,
  pretty = false,
  level = 0,
): string {
  if (node.kind === "number") return node.raw;
  if (node.kind === "null") return "null";
  if (node.kind === "string" || node.kind === "boolean")
    return JSON.stringify(node.value);
  const object = node.kind === "object";
  const entries = object
    ? node.entries.map(
        ([key, item]) =>
          `${JSON.stringify(key)}:${pretty ? " " : ""}${serializeNode(item, pretty, level + 1)}`,
      )
    : node.items.map((item) => serializeNode(item, pretty, level + 1));
  const [open, close] = object ? ["{", "}"] : ["[", "]"];
  if (!entries.length) return open + close;
  return pretty
    ? `${open}\n${entries.map((entry) => "  ".repeat(level + 1) + entry).join(",\n")}\n${"  ".repeat(level)}${close}`
    : open + entries.join(",") + close;
}

export function serializeData(document: DataDocument): string {
  const prefix = document.bom ? "\uFEFF" : "";
  if (document.format === "json") return prefix + serializeNode(document.root);
  return (
    prefix +
    document.rows
      .map(
        (row, index) =>
          row
            .map((cell) =>
              /[",\r\n]/.test(cell) || cell === ""
                ? `"${cell.replace(/"/g, '""')}"`
                : cell,
            )
            .join(",") + document.endings[index],
      )
      .join("")
  );
}

export function formulaRisk(cell: string): boolean {
  return (
    /^[\s\u0000-\u001f]*[=+\-@＝＋－＠]/u.test(cell) || /^[\t\r\n]/.test(cell)
  );
}
export function formulaCount(document: DataDocument): number {
  return document.format === "csv"
    ? document.rows.flat().filter(formulaRisk).length
    : 0;
}

export function transformData(
  document: DataDocument,
  options: TransformOptions,
): DataDocument {
  const operations: Record<Operation, (text: string) => string> = {
    trim: (text) => text.trim(),
    spaces: (text) => text.replace(/[ \t]+/g, " "),
    lower: (text) => text.toLowerCase(),
    upper: (text) => text.toUpperCase(),
    newlines: (text) => text.replace(/\r\n|\r/g, "\n"),
    guard: (text) => (formulaRisk(text) ? "'" + text : text),
  };
  if (!Object.hasOwn(operations, options.operation))
    throw new Error("Unknown transformation.");
  const apply = operations[options.operation];
  let result: DataDocument;
  if (document.format === "csv") {
    if (
      options.column !== null &&
      (!Number.isInteger(options.column) ||
        options.column < 0 ||
        options.column >= document.rows[0].length)
    )
      throw new Error("Choose an existing column.");
    result = {
      ...document,
      rows: document.rows.map((row, r) =>
        row.map((cell, c) =>
          (options.header && r === 0) ||
          (options.column !== null && options.column !== c)
            ? cell
            : apply(cell),
        ),
      ),
    };
  } else {
    if (options.operation === "guard")
      throw new Error("Formula guarding is a CSV operation only.");
    const walk = (node: JsonNode): JsonNode => {
      if (node.kind === "string") return { ...node, value: apply(node.value) };
      if (node.kind === "array")
        return { ...node, items: node.items.map(walk) };
      if (node.kind === "object")
        return {
          ...node,
          entries: node.entries.map(([key, item]) => [key, walk(item)]),
        };
      return node;
    };
    result = { ...document, root: walk(document.root) };
  }
  try {
    assertSize(serializeData(result));
  } catch {
    throw new Error(
      "The transformed result exceeds 256 KiB. Nothing was changed.",
    );
  }
  return result;
}

export function diffData(
  before: DataDocument,
  after: DataDocument,
): Difference {
  if (before.format !== after.format)
    throw new Error("Compare documents in the same format.");
  const changes: Change[] = [];
  let units = 0;
  const add = (path: string, a: string | undefined, b: string | undefined) => {
    if (a !== b) {
      units += path.length + (a?.length ?? 0) + (b?.length ?? 0);
      if (units > LIMITS.diffUnits)
        throw new Error(
          "Diff exceeds 2,000,000 text units. Split the input into smaller documents; no partial diff is reported.",
        );
      changes.push({
        path,
        kind:
          a === undefined ? "added" : b === undefined ? "removed" : "changed",
        ...(a === undefined ? {} : { before: a }),
        ...(b === undefined ? {} : { after: b }),
      });
    }
  };
  if (before.format === "csv" && after.format === "csv") {
    for (let r = 0; r < Math.max(before.rows.length, after.rows.length); r++)
      for (
        let c = 0;
        c < Math.max(before.rows[r]?.length ?? 0, after.rows[r]?.length ?? 0);
        c++
      )
        add(
          `Record ${r + 1} / column ${c + 1}`,
          before.rows[r]?.[c],
          after.rows[r]?.[c],
        );
  } else if (before.format === "json" && after.format === "json") {
    const walk = (
      a: JsonNode | undefined,
      b: JsonNode | undefined,
      path: string,
    ) => {
      if (a?.kind === "object" && b?.kind === "object") {
        const left = new Map(a.entries),
          right = new Map(b.entries);
        for (const key of new Set([...left.keys(), ...right.keys()]))
          walk(
            left.get(key),
            right.get(key),
            path + "/" + key.replace(/~/g, "~0").replace(/\//g, "~1"),
          );
      } else if (a?.kind === "array" && b?.kind === "array") {
        for (let i = 0; i < Math.max(a.items.length, b.items.length); i++)
          walk(a.items[i], b.items[i], path + "/" + i);
      } else
        add(path || "(root)", a && serializeNode(a), b && serializeNode(b));
    };
    walk(before.root, after.root, "");
  }
  return {
    changes,
    added: changes.filter((x) => x.kind === "added").length,
    removed: changes.filter((x) => x.kind === "removed").length,
    changed: changes.filter((x) => x.kind === "changed").length,
  };
}

export class CleanupSession {
  current: DataDocument;
  history: DataDocument[] = [];
  pending?: { document: DataDocument; diff: Difference };
  constructor(readonly original: DataDocument) {
    this.current = original;
  }
  preview(options: TransformOptions): void {
    this.pending = undefined;
    const document = transformData(this.current, options);
    diffData(this.original, document);
    this.pending = { document, diff: diffData(this.current, document) };
  }
  apply(): boolean {
    if (!this.pending?.diff.changes.length) return false;
    if (this.history.length >= LIMITS.history)
      throw new Error(
        "20-step history is full. Undo, reset, or download before starting another session.",
      );
    this.history.push(this.current);
    this.current = this.pending.document;
    this.pending = undefined;
    return true;
  }
  undo(): void {
    this.pending = undefined;
    this.current = this.history.pop() ?? this.current;
  }
  reset(): void {
    this.pending = undefined;
    this.history = [];
    this.current = this.original;
  }
}
