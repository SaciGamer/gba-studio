import path from 'path';

let currentActiveSandboxDirectory: string | null = null;

export function setCurrentActiveSandboxDirectory(directory: string | null): void {
  currentActiveSandboxDirectory = directory ? path.resolve(directory) : null;
}

export function getCurrentActiveSandboxDirectory(): string | null {
  return currentActiveSandboxDirectory;
}
