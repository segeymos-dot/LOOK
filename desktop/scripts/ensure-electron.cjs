const path = require("path");
const fs = require("fs");
const { execFileSync } = require("node:child_process");
const { downloadArtifact } = require("@electron/get");
const { version } = require("electron/package.json");

async function main() {
  const arch = process.arch === "x64" ? "x64" : "arm64";
  console.log(`Ensuring Electron ${version} (darwin ${arch})...`);

  const zipPath = await downloadArtifact({
    version,
    artifactName: "electron",
    platform: "darwin",
    arch,
    force: false,
  });

  const electronRoot = path.resolve(__dirname, "..", "node_modules/electron");
  const distPath = path.join(electronRoot, "dist");

  fs.rmSync(distPath, { recursive: true, force: true });
  fs.mkdirSync(distPath, { recursive: true });

  console.log("Extracting", zipPath);
  execFileSync("/usr/bin/unzip", ["-q", zipPath, "-d", distPath], {
    stdio: "inherit",
  });

  fs.writeFileSync(path.join(distPath, "version"), version);
  fs.writeFileSync(
    path.join(electronRoot, "path.txt"),
    "Electron.app/Contents/MacOS/Electron"
  );

  const frameworks = path.join(distPath, "Electron.app/Contents/Frameworks");
  if (!fs.existsSync(frameworks)) {
    throw new Error("Electron Frameworks missing after extract");
  }

  console.log("Electron ready:", require("electron"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
