import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import transcode from '../dist/main/utils/projectTranscoder/transcode-project.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-progress-'));
try {
  const messages = [];
  const result = await transcode({ projectDir: root, outputDir: path.join(root, 'output'), includeAssets: false, onProgress: message => messages.push(message) });
  assert.equal(result.success, true, result.message);
  const stage = text => messages.findIndex(message => message.includes(text));
  assert(stage('Validando projeto') >= 0);
  assert(stage('Gerando gráficos') > stage('Preparando diretório'));
  assert(stage('Validando referências') > stage('Gerando gráficos'));
  assert(stage('Preparando header de itens') > stage('Validando referências'));
  assert(stage('Gerando código C++') > stage('Preparando header de itens'));
  assert(messages.some(message => message.includes('item header written')), 'Butano output must reach the progress callback');
  console.log('Transcode progress: ordered stages and live Butano output passed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
