import fs from "fs";
import path from "path";

const SRC = path.resolve("src");

// Extensiones de archivos TS que vamos a tocar
const FILE_EXTS = [".ts", ".mts", ".cts"];

// Regex para capturar los specifiers de import/export
const RE_FROM = /(\bfrom\s+['"])(\.{1,2}\/[^'"]+)(['"])/g;
const RE_EXPORT_FROM = /(\bexport\s+[^'"]*\s+from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g;
const RE_DYNAMIC = /(import\(\s*['"])(\.{1,2}\/[^'"]+)(['"]\s*\))/g;

function normalizeSpec(spec) {
  // .ts/.mts/.cts -> .js
  if (/\.(cts|mts|ts)$/.test(spec)) {
    return spec.replace(/\.(cts|mts|ts)$/, ".js");
  }
  // si no tiene extensión conocida -> añade .js
  if (!/\.(m?js|c?m?js|json|node)$/.test(spec)) {
    return `${spec}.js`;
  }
  return spec;
}

function processCode(code) {
  let changed = false;

  const replacer = (_, p1, spec, p3) => {
    const updated = normalizeSpec(spec);
    if (updated !== spec) changed = true;
    return `${p1}${updated}${p3}`;
  };

  code = code.replace(RE_FROM, replacer);
  code = code.replace(RE_EXPORT_FROM, replacer);
  code = code.replace(RE_DYNAMIC, replacer);

  return { code, changed };
}

function visit(filePath) {
  let code = fs.readFileSync(filePath, "utf8");
  const { code: out, changed } = processCode(code);
  if (changed) {
    fs.writeFileSync(filePath, out, "utf8");
    console.log("fixed:", path.relative(process.cwd(), filePath));
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (FILE_EXTS.some(ext => p.endsWith(ext))) visit(p);
  }
}

if (!fs.existsSync(SRC)) {
  console.error("No existe la carpeta src/");
  process.exit(1);
}

walk(SRC);
console.log("Done.");
