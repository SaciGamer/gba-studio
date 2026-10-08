import { AntdToken } from "@/components/common/AntDToken";
import { normalizeDemoControls } from '@/utils/demoControls';
import { useI18n } from '@/i18n/I18n';
import { useEffect } from "react";

const Emulator: React.FC = () => {
  const { token } = AntdToken();
  const { t } = useI18n();

  let localSettings = null;
  const saved = localStorage.getItem("appSettings");
  if (saved) {
    localSettings = JSON.parse(saved);
  }

  const controlsConfig = normalizeDemoControls(localSettings?.controls);
  const showBottomMenu = (localSettings as any)?.demoShowMenu ?? false;
  const rightClickToLicense = (localSettings as any)?.demoShowLicense ?? false;

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split("?")[1]);
    const romPath = params.get("rom");
    const gameId = romPath?.split("/").pop()?.replace(/\.[^/.]+$/, "");
		const emulatorJs = (window as any);

    // emulatorJs.EJS_alignStartButton = "center"; // top | center | bottom // StartButtom
    emulatorJs.EJS_player = "#root-demo-game";
    emulatorJs.EJS_core = "gba";
    emulatorJs.EJS_color = token.colorPrimary;
    emulatorJs.EJS_backgroundColor = token.colorBgContainer;
    emulatorJs.EJS_pathtodata = "http://localhost:3000/emulatorjs-data/";
    emulatorJs.EJS_gameUrl = romPath;
    emulatorJs.EJS_startOnLoaded = true;
    emulatorJs.EJS_hideSettings = [/*'fps',*/ 'videoRotation', 'vsync', 'webgl2Enabled'];
    const publishMetrics = (event: Event) => window.electronAPI.send('runtime-monitor-metrics', (event as CustomEvent).detail);
    window.addEventListener('gba-studio:runtime-monitor', publishMetrics);
    emulatorJs.EJS_Buttons = {
      resourceMonitor: {
        visible: showBottomMenu,
        displayName: t('monitor.title'),
        icon: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0-9 9 9 9 0 0 0 18 0 9 9 0 0 0-9-9zm0 2a7 7 0 0 1 7 7c0 1.6-.5 3.1-1.4 4.3H6.4A7 7 0 0 1 12 5zm4.1 2.8-5.3 3.5a1.8 1.8 0 1 0 2.5 2.5l2.8-6z"/></svg>',
        callback: () => window.electronAPI.send('open-runtime-monitor', t('monitor.title')),
      },
      // restart: false,
      // playPause: false,
      screenshot: false,
      screenRecord: false,
      quickSave: false,
      quickLoad: false,
      
      saveState: false,
      loadState: false,
      
      gamepad: false,
      cheat: false,
      cacheManager: false,
      saveSavFiles: false,
      loadSavFiles: false,
      volume: false,

      // netplay: false,
      // diskButton: false,

      // mute: false,
      // unmute: false,
      // volumeSlider: false,
      // volume: false,
      
      contextMenu: false,
      settings: false, // TODO Ver outras funções para parametrizar
      fullscreen: false,
      rightClick: rightClickToLicense,
      // exitEmulation: false,
      exitEmulation: {
        visible: true,
        displayName: "Exit Demo - " + gameId,
        // icon: '<svg viewBox="0 0 320 512"><path d="M361 215C375.3 223.8 384 239.3 384 256C384 272.7 375.3 288.2 361 296.1L73.03 472.1C58.21 482 39.66 482.4 24.52 473.9C9.377 465.4 0 449.4 0 432V80C0 62.64 9.377 46.63 24.52 38.13C39.66 29.64 58.21 29.99 73.03 39.04L361 215z"/></svg>',
        callback: () => {
          window.electronAPI.send('stop-emulator', null); 
          console.log('..: Emulator.tsx Stop emulator')
        }
      },
    };
    emulatorJs.EJS_askBeforeExit = false;
    emulatorJs.EJS_gameID = gameId;        // evita conflito de saves e netplay
    const configuredVolume = Number(localSettings?.demoAudioVolume);
    emulatorJs.EJS_volume = Number.isFinite(configuredVolume)
      ? Math.min(1, Math.max(0, configuredVolume))
      : 1;
    emulatorJs.EJS_muted = localSettings?.demoAudioMuted === true;
    // emulatorJs.EJS_language = "pt";        // força idioma correto
    emulatorJs.EJS_DEBUG_XX = true;        // força usar emulator.js em vez de minificado
    // Project settings own the demo audio defaults. EmulatorJS local storage is
    // disabled so old per-game values cannot override the configured defaults.
    emulatorJs.EJS_disableLocalStorage = true;
		// emulatorJs.EJS_cacheConfig = {
		// 	enabled: false,
		// 	// cacheMaxSizeMB: 0, //4096
		// 	// cacheMaxAgeMins: 0 //7200
		// };

    // emulatorJs.EJS_onExit = { callback: () => {
    //     window.electronAPI.send('stop-emulator', null); 
    //     console.log('..: Emulator.tsx Stop emulator')
    //   }
    // };

    emulatorJs.EJS_defaultOptions = {
      'shader': localSettings?.demoFilter ? localSettings?.demoFilter : '',
      'fps': localSettings?.demoShowFPS ? "show" : "hide",
      // The custom EmulatorJS build only creates the F2 rewind control when
      // this RetroArch option is enabled before the core starts.
      'rewindEnabled': 'enabled',
    };

    emulatorJs.EJS_defaultControls = controlsConfig;
    emulatorJs.EJS_gbaStudioGamepad = localSettings?.demoJoystick ?? null;
    emulatorJs.EJS_showBottomMenu = showBottomMenu;

    const script = document.createElement("script");
    script.src = "http://localhost:3000/emulatorjs-data/loader.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      window.removeEventListener('gba-studio:runtime-monitor', publishMetrics);
      document.body.removeChild(script);
    };
  }, []);

  return <div id="root-demo-game" style={{ width: "240px", height: "160px" }} />;
}

export default Emulator;
