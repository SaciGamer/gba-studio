import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Obter o caminho do diretório atual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CompileResult {
  stdout: string;
  stderr: string;
}

const compileGBA = (): Promise<CompileResult> => {
  return new Promise((resolve, reject) => {
    console.log("..: Entrou na compilação :..");
    const gbaProjectPath = path.join(__dirname, '../../gba-project');
    
    exec('make rebuild', { cwd: gbaProjectPath }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Erro de compilação: ${error}`);
        reject(error);
        return;
      }
      console.log(`Saída da compilação: ${stdout}`);
      resolve({ stdout, stderr });
    });
  });
}

export default compileGBA;