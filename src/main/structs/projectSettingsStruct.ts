import path from 'path';
import fs from 'fs';

// Função para criar o arquivo ${nameFile}.gbasres
export function createGenericSettingsStruct(basePath: string, nameFile: string, structSettings?: any, stringSettings?: any): void {
    let filePath = path.join(basePath, nameFile);

    if (!nameFile.endsWith('.gbaproj') && !nameFile.endsWith('.gitignore'))
        filePath = path.join(basePath, `${nameFile}.gbasres`);

    if (filePath != null && !fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, structSettings ? JSON.stringify(structSettings, null, 2) : stringSettings ? `${stringSettings}` : '');
        console.log(`..: Arquivo de configurações criado: ${filePath}`);
    }
}