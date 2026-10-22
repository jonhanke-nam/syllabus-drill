// Wraps the Artifact page (syllabus-drill.html) into a standalone index.html.
import { readFileSync, writeFileSync } from "node:fs";

export function buildIndex() {
  const page = readFileSync(new URL("./syllabus-drill.html", import.meta.url), "utf8");
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n</head>\n<body>\n'
    + page + '\n</body>\n</html>\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(new URL("./index.html", import.meta.url), buildIndex());
  console.log("Wrote index.html");
}
