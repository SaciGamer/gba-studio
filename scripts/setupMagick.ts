import decompress from "decompress";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function cleanDir(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

async function setupMagick() {
  const target = process.argv[2]; // winx64, winx86, linux, mac
  const dest = path.join(__dirname, "..", "bin", "image-magick");
  cleanDir(dest);

  switch (target) {
    case "win64":
      console.log("Extracting ImageMagick for:", target);
      await decompress(path.join(__dirname, "..", "tools/image-magick/", "win-magick-x64.zip"), dest);
      break;
    case "win32":
      console.log("Extracting ImageMagick for:", target);
      await decompress(path.join(__dirname, "..", "tools/image-magick/", "win-magick-x86.zip"), dest);
      break;
    case "darwin": // ERROR
      console.log("Extracting ImageMagick for:", target);
      await decompress(path.join(__dirname, "..", "tools/image-magick/", "apple-magick.tar.gz"), dest);
      break;
    case "linux":
      console.log("Extracting ImageMagick for:", target);
      fs.copyFileSync(path.join(__dirname, "..", "tools/image-magick/", "magick"), path.join(dest, "magick"));
      fs.chmodSync(path.join(dest, "magick"), 0o755);
      break;
    default:
      console.error("Plataforma não suportada:", target);
      process.exit(1);
  }

}

setupMagick().catch(err => {
  console.error("Erro ao configurar ImageMagick:", err);
});