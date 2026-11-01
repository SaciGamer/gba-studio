import { BrowserWindow, dialog, shell, type MessageBoxOptions } from 'electron';
import https from 'https';

const LATEST_RELEASE_URL = 'https://api.github.com/repos/SaciGamer/gba-studio/releases/latest';
const DOWNLOAD_URL = 'https://sacigamer.itch.io/gba-studio/purchase';
const REQUEST_TIMEOUT_MS = 4000;

interface ReleaseResponse {
  tag_name?: unknown;
  name?: unknown;
  html_url?: unknown;
}

interface Version {
  major: number;
  minor: number;
  patch: number;
}

export interface UpdateCheckOptions {
  currentVersion: string;
  parentWindow?: BrowserWindow | null;
  showUpToDate?: boolean;
}

function parseVersion(value: string): Version | null {
  const match = value.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compareVersions(left: Version, right: Version): number {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

function getLatestReleaseVersion(): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = https.get(LATEST_RELEASE_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'GBA-Studio-Update-Checker',
      },
    }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`GitHub returned HTTP ${response.statusCode ?? 'unknown'}`));
        return;
      }

      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => { body += chunk; });
      response.on('end', () => {
        try {
          const release = JSON.parse(body) as ReleaseResponse;
          if (typeof release.tag_name !== 'string' || !parseVersion(release.tag_name)) {
            throw new Error('GitHub release has no valid semantic version');
          }
          resolve(release.tag_name);
        } catch (error) {
          reject(error);
        }
      });
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error('Update check timed out'));
    });
    request.once('error', reject);
  });
}

function getDialogParent(parentWindow?: BrowserWindow | null): BrowserWindow | undefined {
  return parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined;
}

function showUpdateMessage(parentWindow: BrowserWindow | null | undefined, options: MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  const parent = getDialogParent(parentWindow);
  return parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options);
}

export async function checkForUpdates({ currentVersion, parentWindow, showUpToDate = false }: UpdateCheckOptions): Promise<void> {
  const current = parseVersion(currentVersion);
  if (!current) {
    console.warn('Cannot check updates: invalid current version', currentVersion);
    return;
  }

  try {
    const latestVersionText = await getLatestReleaseVersion();
    const latest = parseVersion(latestVersionText);
    if (!latest) return;

    if (compareVersions(latest, current) > 0) {
      const response = await showUpdateMessage(parentWindow, {
        type: 'info',
        title: 'GBA Studio update available',
        message: `A newer version of GBA Studio is available: ${latestVersionText.replace(/^v/i, '')}`,
        detail: `You are using GBA Studio ${currentVersion}. Update now to the latest version?`,
        buttons: ['Update now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      });
      if (response.response === 0) await shell.openExternal(DOWNLOAD_URL);
      return;
    }

    if (showUpToDate) {
      await showUpdateMessage(parentWindow, {
        type: 'info',
        title: 'GBA Studio',
        message: "You're up-to-date!",
        detail: `GBA Studio ${currentVersion} is currently the newest version available`,
        buttons: ['OK'],
        defaultId: 0,
      });
    }
  } catch (error) {
    console.warn('Could not check for GBA Studio updates:', error);
    if (showUpToDate) {
      await showUpdateMessage(parentWindow, {
        type: 'warning',
        title: 'GBA Studio',
        message: 'Could not check for updates.',
        detail: 'Please check your internet connection and try again.',
        buttons: ['OK'],
        defaultId: 0,
      });
    }
  }
}
