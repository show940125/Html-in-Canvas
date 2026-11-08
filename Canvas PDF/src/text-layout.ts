/** Unicode-aware box wrapping, including Chinese without spaces and long URLs. */
export function wrapText(
  text: string,
  width: number,
  measure: (text: string) => number,
) {
  const lines: string[] = [];
  for (const paragraph of text.replaceAll("\r\n", "\n").split("\n")) {
    let line = "";
    for (const char of paragraph) {
      if (line && measure(line + char) > width) {
        if (char === " ") {
          lines.push(line.trimEnd());
          line = "";
          continue;
        }
        const split = line.lastIndexOf(" ");
        if (split > 0) {
          lines.push(line.slice(0, split));
          line = line.slice(split + 1) + char;
        } else {
          lines.push(line);
          line = char;
        }
      } else line += char;
    }
    lines.push(line);
  }
  return lines;
}
