/** Bounded recursive-descent arithmetic. Never evaluates JavaScript. */
export function calculate(source: string): number {
  const compact = source.replace(/\s/g, "");
  const tokens = compact.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/^]/g) ?? [];
  if (
    !compact ||
    compact.length > 512 ||
    tokens.length > 256 ||
    tokens.join("") !== compact
  )
    throw new Error("Use numbers, parentheses and + - * / ^ only.");
  let index = 0;
  let depth = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];
  function primary(): number {
    if (++depth > 64) throw new Error("This expression is nested too deeply.");
    let value: number;
    if (peek() === "(") {
      take();
      value = sum();
      if (take() !== ")") throw new Error("Close each opening parenthesis.");
    } else {
      const token = take();
      if (!token || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token))
        throw new Error("A number was expected here.");
      value = Number(token);
    }
    depth--;
    return value;
  }
  function power(): number {
    const value = primary();
    return peek() === "^" ? (take(), value ** unary()) : value;
  }
  function unary(): number {
    if (peek() === "+") {
      take();
      return unary();
    }
    if (peek() === "-") {
      take();
      return -unary();
    }
    return power();
  }
  function product(): number {
    let value = unary();
    while (peek() === "*" || peek() === "/") {
      const operator = take();
      const next = unary();
      if (operator === "/" && next === 0)
        throw new Error("Division by zero is not defined.");
      value = operator === "*" ? value * next : value / next;
    }
    return value;
  }
  function sum(): number {
    let value = product();
    while (peek() === "+" || peek() === "-") {
      const operator = take();
      const next = product();
      value = operator === "+" ? value + next : value - next;
    }
    return value;
  }
  const result = sum();
  if (index !== tokens.length)
    throw new Error("Check the operators between your numbers.");
  if (!Number.isFinite(result))
    throw new Error("The result is outside the supported number range.");
  return Number(result.toPrecision(14));
}

export function caesar(text: string, shift: number): string {
  if (!Number.isSafeInteger(shift))
    throw new Error("The shift must be a whole number.");
  const offset = ((shift % 26) + 26) % 26;
  return text.replace(/[a-z]/gi, (letter) => {
    const base = letter >= "a" && letter <= "z" ? 97 : 65;
    return String.fromCharCode(
      base + ((letter.charCodeAt(0) - base + offset) % 26),
    );
  });
}

export type Format = "sentence" | "title" | "upper" | "lower" | "trim";
export function formatWords(text: string, mode: Format): string {
  if (mode === "upper") return text.toLocaleUpperCase();
  if (mode === "lower") return text.toLocaleLowerCase();
  if (mode === "trim")
    return text
      .replace(/[ \t]+/g, " ")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .trim();
  if (mode === "title")
    return text
      .toLocaleLowerCase()
      .replace(
        /(^|[^\p{L}\p{N}])(\p{L})/gu,
        (_all, start: string, letter: string) =>
          start + letter.toLocaleUpperCase(),
      );
  return text
    .toLocaleLowerCase()
    .replace(
      /(^\s*|[.!?]\s+)(\p{L})/gu,
      (_all, start: string, letter: string) =>
        start + letter.toLocaleUpperCase(),
    );
}
export function wordCount(text: string): number {
  return (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length;
}
