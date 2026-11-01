import { BrowserWindow, type IpcMain, type WebContents } from 'electron';

interface MonitorWindowOptions {
  preloadPath: string;
  iconPath: string;
  rendererUrl: string;
  onWindowChange?: (window: BrowserWindow | null) => void;
}

/** Own the monitor and retained sample for exactly one emulator session. */
export class RuntimeMonitorWindow {
  private owner: BrowserWindow | null = null;
  private window: BrowserWindow | null = null;
  private latestMessage: string | null = null;

  constructor(private readonly options: MonitorWindowOptions) {}

  attach(owner: BrowserWindow): void {
    this.close();
    this.owner = owner;
    owner.once('closed', () => {
      if (this.owner === owner) this.close();
    });
  }

  private fromEmulator(sender: WebContents): boolean {
    return !!this.owner && !this.owner.isDestroyed() && this.owner.webContents === sender;
  }

  open(sender: WebContents, title: unknown): void {
    if (!this.fromEmulator(sender)) return;
    if (this.window && !this.window.isDestroyed()) {
      if (this.window.isMinimized()) this.window.restore();
      if (this.owner?.isVisible()) this.window.show();
      this.window.focus();
      return;
    }
    const monitor = new BrowserWindow({
      width: 390,
      height: 640,
      useContentSize: true,
      parent: this.owner!,
      show: false,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      icon: this.options.iconPath,
      title: typeof title === 'string' && title.length < 120 ? title : 'GBA Studio - Resource Monitor',
      webPreferences: { preload: this.options.preloadPath, nodeIntegration: false, contextIsolation: true },
    });
    this.window = monitor;
    this.options.onWindowChange?.(monitor);
    monitor.setMenu(null);
    monitor.setMenuBarVisibility(false);
    monitor.once('ready-to-show', () => {
      if (!monitor.isDestroyed() && this.owner?.isVisible()) monitor.show();
    });
    monitor.once('closed', () => {
      if (this.window === monitor) {
        this.window = null;
        this.options.onWindowChange?.(null);
      }
    });
    void monitor.loadURL(this.options.rendererUrl);
  }

  publish(sender: WebContents, message: unknown): void {
    if (!this.fromEmulator(sender) || typeof message !== 'string' || message.length > 512 || !/\[GBAS_MONITOR:1\]/.test(message)) return;
    this.latestMessage = message;
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send('runtime-monitor-metrics', message);
  }

  ready(sender: WebContents): void {
    if (this.window && !this.window.isDestroyed() && this.window.webContents === sender && this.latestMessage) {
      sender.send('runtime-monitor-metrics', this.latestMessage);
    }
  }

  close(): void {
    const monitor = this.window;
    this.window = null;
    this.owner = null;
    this.latestMessage = null;
    this.options.onWindowChange?.(null);
    if (monitor && !monitor.isDestroyed()) monitor.destroy();
  }
}

export function registerRuntimeMonitorIpc(ipc: IpcMain, monitor: RuntimeMonitorWindow): void {
  ipc.on('open-runtime-monitor', (event, title: unknown) => monitor.open(event.sender, title));
  ipc.on('runtime-monitor-metrics', (event, message: unknown) => monitor.publish(event.sender, message));
  ipc.on('runtime-monitor-ready', event => monitor.ready(event.sender));
}
