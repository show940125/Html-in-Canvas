import { cp, readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import "./stage-runtime.mjs";
import "./collect-licenses.mjs";
import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
const root = new URL("../", import.meta.url),
  destination = new URL("../dist/", root),
  version = JSON.parse(
    await readFile(new URL("package.json", root), "utf8"),
  ).version;
if (
  JSON.parse(await readFile(new URL("public/manifest.json", root), "utf8"))
    .version !== version
)
  throw Error("Manifest and package versions differ");
await mkdir(new URL("dist/licenses/", root), { recursive: true });
await mkdir(destination, { recursive: true });
await cp(new URL("LICENSE", root), new URL("dist/licenses/AGPL-3.0.txt", root));
await cp(new URL("public/GUIDE.html", root), new URL("dist/GUIDE.html", root));
for (const name of [
  "README.md",
  "STATUS.md",
  "SOURCES.md",
  "THIRD_PARTY_NOTICES.md",
  "ACCEPTANCE.md",
  "assets.lock.json",
  "REVIEW-20261108.md",
])
  await cp(new URL(name, root), new URL("dist/" + name, root));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const lock = JSON.parse(
  await readFile(new URL("assets.lock.json", root), "utf8"),
);
for (const entry of lock.files) {
  const data = await readFile(new URL(entry.path, root));
  if (sha(data) !== entry.sha256)
    throw Error("Asset hash mismatch: " + entry.path);
}
const files = {},
  inventory = [],
  includedEvidence = new Set();
async function walk(base, prefix = "", relative = "", target = files) {
  for (const d of await readdir(new URL(relative, base), {
    withFileTypes: true,
  })) {
    const p = relative + d.name;
    if (target === files && p === "bundle-inventory.json") continue;
    if (
      target === files &&
      !d.isDirectory() &&
      p.startsWith("verification/") &&
      p !== "verification/index.json" &&
      !includedEvidence.has(p)
    )
      continue;
    if (d.isDirectory()) await walk(base, prefix, p + "/", target);
    else {
      const b = new Uint8Array(await readFile(new URL(p, base)));
      target[prefix + p] = b;
      if (target === files)
        inventory.push({ path: prefix + p, bytes: b.length, sha256: sha(b) });
    }
  }
}
await mkdir(new URL("dist/verification/", root), { recursive: true });
const evidence = [];
for (const [dir, name] of [
  ["acceptance", "acceptance.json"],
  ["acceptance-dom", "acceptance.json"],
  ["extended", "checks.json"],
  ["runtime", "checks.json"],
  ["shared-image", "checks.json"],
  ["ocr-matrix", "matrix.json"],
  ["ocr-matrix", "cancel.json"],
  ["evaluation", "evaluation.json"],
  ["native-translation", "result.json"],
  ["gemini", "result.json"],
  ["mime", "checks.json"],
  ["mime-local", "checks.json"],
  ["mime-public", "checks.json"],
  ["native-translation", "glossary.json"],
  ["ocr-edit", "checks.json"],
  ["ocr-edit-dom", "checks.json"],
  ["font-commit", "result.json"],
]) {
  const path = "output/" + dir + "/" + name;
  let included = false;
  if (!process.argv.includes("--without-evidence")) {
    try {
      await cp(
        new URL(path, root),
        new URL("dist/verification/" + dir + "-" + name, root),
      );
      included = true;
      includedEvidence.add("verification/" + dir + "-" + name);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  evidence.push({
    path,
    included,
    status: included
      ? "record-included-see-run-date"
      : "not-included-not-verified-by-build",
  });
}
await writeFile(
  new URL("dist/verification/index.json", root),
  JSON.stringify({ version, evidence }, null, 2),
);
await walk(new URL("dist/", root));
files["bundle-inventory.json"] = strToU8(JSON.stringify(inventory, null, 2));
await writeFile(
  new URL("dist/bundle-inventory.json", root),
  files["bundle-inventory.json"],
);
const runtime = zipSync(files, { level: 6 }),
  runtimeName = `canvas-pdf-${version}-offline.zip`;
await writeFile(new URL(runtimeName, destination), runtime);
const source = {};
for (const dir of [
  "src/",
  "tests/",
  "scripts/",
  "public/licenses/",
  "public/media/",
  "benchmarks/",
])
  await walk(new URL(dir, root), "Canvas PDF/" + dir, "", source);
for (const name of [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "index.html",
  "README.md",
  "STATUS.md",
  "SOURCES.md",
  "THIRD_PARTY_NOTICES.md",
  "ACCEPTANCE.md",
  "REVIEW-20261108.md",
  "IMPLEMENTATION.md",
  "LICENSE",
  "assets.lock.json",
  "requirements-test.txt",
  ".gitignore",
])
  source["Canvas PDF/" + name] = new Uint8Array(
    await readFile(new URL(name, root)),
  );
for (const name of [
  "manifest.json",
  "background.js",
  "GUIDE.html",
  "guide.css",
])
  source["Canvas PDF/public/" + name] = new Uint8Array(
    await readFile(new URL("public/" + name, root)),
  );
await walk(new URL("../shared/", root), "shared/", "", source);
source["docs/media/canvas-pdf-editor.png"] = new Uint8Array(
  await readFile(new URL("../docs/media/canvas-pdf-editor.png", root)),
);
source[".github/workflows/canvas-pdf.yml"] = new Uint8Array(
  await readFile(new URL("../.github/workflows/canvas-pdf.yml", root)),
);
source["LICENSE"] = new Uint8Array(await readFile(new URL("../LICENSE", root)));
for (const name of ["editcore.tgz", "editcore-corresponding-source.zip"])
  source["Canvas PDF/output/upstream/" + name] = [
    new Uint8Array(await readFile(new URL("output/upstream/" + name, root))),
    { level: 0 },
  ];
const sourceName = `canvas-pdf-${version}-source.zip`,
  sourceZip = zipSync(source, { level: 6 });
await writeFile(new URL(sourceName, destination), sourceZip);
await writeFile(
  new URL(`canvas-pdf-${version}-SHA256.txt`, destination),
  sha(runtime) +
    "  " +
    runtimeName +
    "\n" +
    sha(sourceZip) +
    "  " +
    sourceName +
    "\n",
);
console.log(
  JSON.stringify(
    {
      runtimeBytes: runtime.length,
      sourceBytes: sourceZip.length,
      files: inventory.length,
    },
    null,
    2,
  ),
);
