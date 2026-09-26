import https from 'https';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface LauncherCredit {
  entry: string;
  href?: string;
}

interface CreditsDocument {
  version: number;
  updatedAt?: string;
  credits: LauncherCredit[];
}

const REMOTE_CREDITS_URL = 'https://sacigamer.github.io/gba-studio-site/data/gba-studio-credits.json';
const DEFAULT_CREDITS_FILENAME = 'gba-studio-credits.json';
const CREDITS_CONFIG_DIRECTORY = 'config';
const MAX_DOCUMENT_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 3500;

const emergencyCredits: LauncherCredit[] = [
  { entry: '@#SaciGamer-Dev', href: 'https://sacigamer.github.io/gba-studio-site/' },
  { entry: 'GBA Studio contributors' },
  { entry: '$Thank you for building with us' },
];

let refreshPromise: Promise<LauncherCredit[] | null> | null = null;

function isSafeCredit(value: unknown): value is LauncherCredit {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.entry !== 'string' || candidate.entry.trim().length === 0 || candidate.entry.length > 240) return false;
  if (candidate.href === undefined) return true;
  if (typeof candidate.href !== 'string' || candidate.href.length > 512) return false;
  try {
    const url = new URL(candidate.href);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function parseCreditsDocument(value: unknown): CreditsDocument | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || !Array.isArray(candidate.credits) || candidate.credits.length > 200) return null;
  const credits = candidate.credits.filter(isSafeCredit).map((credit) => ({
    entry: credit.entry.trim(),
    ...(credit.href ? { href: credit.href } : {}),
  }));
  if (credits.length !== candidate.credits.length) return null;
  return {
    version: 1,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : undefined,
    credits,
  };
}

async function readCreditsFile(filePath: string): Promise<LauncherCredit[] | null> {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    const document = parseCreditsDocument(JSON.parse(raw));
    return document?.credits ?? null;
  } catch {
    return null;
  }
}

function getDefaultCreditsPath(): string {
  return path.join(app.getAppPath(), 'dist', 'renderer', 'data', DEFAULT_CREDITS_FILENAME);
}

function getCacheCreditsPath(): string {
  return path.join(app.getPath('userData'), CREDITS_CONFIG_DIRECTORY, DEFAULT_CREDITS_FILENAME);
}

function fetchRemoteCredits(): Promise<LauncherCredit[]> {
  return new Promise((resolve, reject) => {
    const request = https.get(REMOTE_CREDITS_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GBA-Studio-Credits',
      },
    }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Credits request returned HTTP ${response.statusCode ?? 'unknown'}`));
        return;
      }

      let body = '';
      let tooLarge = false;
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        body += chunk;
        if (Buffer.byteLength(body, 'utf8') > MAX_DOCUMENT_BYTES) {
          tooLarge = true;
          request.destroy(new Error('Credits document is too large'));
        }
      });
      response.on('end', () => {
        if (tooLarge) return;
        try {
          const document = parseCreditsDocument(JSON.parse(body));
          if (!document) throw new Error('Invalid credits document');
          resolve(document.credits);
        } catch (error) {
          reject(error);
        }
      });
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error('Credits request timed out'));
    });
    request.once('error', reject);
  });
}

async function writeCache(credits: LauncherCredit[]): Promise<void> {
  const cachePath = getCacheCreditsPath();
  const temporaryPath = `${cachePath}.${process.pid}.tmp`;
  const document: CreditsDocument = {
    version: 1,
    updatedAt: new Date().toISOString(),
    credits,
  };
  try {
    await fs.promises.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.promises.writeFile(temporaryPath, JSON.stringify(document, null, 2), 'utf8');
    await fs.promises.rename(temporaryPath, cachePath);
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
    console.warn('Could not cache remote credits:', error);
  }
}

async function loadLocalCredits(): Promise<LauncherCredit[]> {
  const cached = await readCreditsFile(getCacheCreditsPath());
  if (cached) return cached;
  const bundled = await readCreditsFile(getDefaultCreditsPath());
  return bundled ?? emergencyCredits;
}

export async function loadLauncherCredits(): Promise<LauncherCredit[]> {
  return loadLocalCredits();
}

export async function refreshLauncherCredits(): Promise<LauncherCredit[] | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const remoteCredits = await fetchRemoteCredits();
        await writeCache(remoteCredits);
        return remoteCredits;
      } catch (error) {
        console.info('Using local credits because the remote document is unavailable:', error);
        return null;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}
