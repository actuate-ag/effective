/**
 * Replace JS/TS comments with whitespace, preserving line/column offsets and
 * leaving string/template literals intact. Used so regex pattern detectors
 * don't fire on commented-out code.
 *
 * Direct port of the harness-kit stripComments: same character-by-character
 * scanner, same string/template handling.
 */
export const stripComments = (source: string): string => {
  const out: string[] = [];
  let index = 0;

  const at = (current: number) => source.charAt(current);
  const keep = () => {
    out.push(at(index));
    index += 1;
  };
  const blank = () => {
    out.push(at(index) === "\n" ? "\n" : " ");
    index += 1;
  };

  while (index < source.length) {
    const current = at(index);
    const next = index + 1 < source.length ? at(index + 1) : "";

    if (current === "'" || current === '"') {
      const quote = current;
      keep();
      while (index < source.length && at(index) !== quote) {
        if (at(index) === "\\" && index + 1 < source.length) {
          keep();
          keep();
          continue;
        }
        keep();
      }
      if (index < source.length) keep();
      continue;
    }

    if (current === "`") {
      keep();
      while (index < source.length && at(index) !== "`") {
        if (at(index) === "\\" && index + 1 < source.length) {
          keep();
          keep();
          continue;
        }
        keep();
      }
      if (index < source.length) keep();
      continue;
    }

    if (current === "/" && next === "/") {
      blank();
      blank();
      while (index < source.length && at(index) !== "\n") blank();
      continue;
    }

    if (current === "/" && next === "*") {
      blank();
      blank();
      while (index < source.length) {
        if (at(index) === "*" && index + 1 < source.length && at(index + 1) === "/") {
          blank();
          blank();
          break;
        }
        blank();
      }
      continue;
    }

    keep();
  }

  return out.join("");
};
