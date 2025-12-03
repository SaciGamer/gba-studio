import decompress from "decompress";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupMagick() {
  const platform = process.platform;
  const arch = process.arch;
  const dest = path.join(__dirname, "..", "dist/tools/image-magick");

  fs.mkdirSync(dest, { recursive: true });

  if (platform === "win32") {
    const file = arch === "x64" ? "win-magick-x64.zip" : "win-magick-x86.zip";
    console.log(" Extracting ImageMagick for Windows:", file);
    
    await decompress(
      path.join(__dirname, "..", "tools/image-magick", file),
      dest
    );
  } else if (platform === "darwin") {
    await decompress(
      path.join(__dirname, "..", "tools/image-magick/apple-magick.tar.gz"),
      dest
    );
  } else if (platform === "linux") {
    fs.copyFileSync(
      path.join(__dirname, "..", "tools/image-magick/magick"),
      path.join(dest, "magick")
    );
    fs.chmodSync(path.join(dest, "magick"), 0o755);
  }
}

setupMagick().catch(err => {
  console.error("Erro ao configurar ImageMagick:", err);
});


// exemplo para executar 
/* 
* 
    import path from "path";

    const magickPath = path.join(process.resourcesPath, "bin", "magick.exe");
    const butanoPath = path.join(process.resourcesPath, "bin", "butano.exe");
    const mgbaPath   = path.join(process.resourcesPath, "bin", "mgba.exe");
*/