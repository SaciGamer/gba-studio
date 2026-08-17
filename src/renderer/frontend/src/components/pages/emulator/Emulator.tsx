import { AntdToken } from "@/components/common/AntDToken";
import { useEffect } from "react";

const defaultControls = {
  0: {
    0: {
      'value': 'x',
      'value2': 'BUTTON_2'
    },
    1: {
      'value': 's',
      'value2': 'BUTTON_4'
    },
    2: {
      'value': 'v',
      'value2': 'SELECT'
    },
    3: {
      'value': 'enter',
      'value2': 'START'
    },
    4: {
      'value': 'up arrow',
      'value2': 'DPAD_UP'
    },
    5: {
      'value': 'down arrow',
      'value2': 'DPAD_DOWN'
    },
    6: {
      'value': 'left arrow',
      'value2': 'DPAD_LEFT'
    },
    7: {
      'value': 'right arrow',
      'value2': 'DPAD_RIGHT'
    },
    8: {
      'value': 'z',
      'value2': 'BUTTON_1'
    },
    9: {
      'value': 'a',
      'value2': 'BUTTON_3'
    },
    10: {
      'value': 'q',
      'value2': 'LEFT_TOP_SHOULDER'
    },
    11: {
      'value': 'e',
      'value2': 'RIGHT_TOP_SHOULDER'
    },
    12: {
      'value': 'tab',
      'value2': 'LEFT_BOTTOM_SHOULDER'
    },
    13: {
      'value': 'r',
      'value2': 'RIGHT_BOTTOM_SHOULDER'
    },
    14: {
      'value': '',
      'value2': 'LEFT_STICK',
    },
    15: {
      'value': '',
      'value2': 'RIGHT_STICK',
    },
    16: {
      'value': 'h',
      'value2': 'LEFT_STICK_X:+1'
    },
    17: {
      'value': 'f',
      'value2': 'LEFT_STICK_X:-1'
    },
    18: {
      'value': 'g',
      'value2': 'LEFT_STICK_Y:+1'
    },
    19: {
      'value': 't',
      'value2': 'LEFT_STICK_Y:-1'
    },
    20: {
      'value': 'l',
      'value2': 'RIGHT_STICK_X:+1'
    },
    21: {
      'value': 'j',
      'value2': 'RIGHT_STICK_X:-1'
    },
    22: {
      'value': 'k',
      'value2': 'RIGHT_STICK_Y:+1'
    },
    23: {
      'value': 'i',
      'value2': 'RIGHT_STICK_Y:-1'
    },
    24: {
      'value': 'undefined'
    },
    25: {
      'value': 'undefined'
    },
    26: {
      'value': 'undefined'
    },
    27: {
      'value': 'f1'
    },
    28: {
      'value': 'f2'
    },
    29: {
      'value': 'f3'
    },
  },
  1: {},
  2: {},
  3: {}
};
const Emulator: React.FC = () => {
  const { token } = AntdToken();

  let localSettings = null;
  const saved = localStorage.getItem("appSettings");
  if (saved) {
    localSettings = JSON.parse(saved);
  }

	const controlsConfig = (localSettings as { controls?: typeof defaultControls } | undefined)?.controls
		?? defaultControls;
  const showBottomMenu = (localSettings as any).demoShowMenu ?? false;
  const rightClickToLicense = (localSettings as any).demoShowLicense ?? false;

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
    emulatorJs.EJS_Buttons = {
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
    // emulatorJs.EJS_language = "pt";        // força idioma correto
    emulatorJs.EJS_DEBUG_XX = true;        // força usar emulator.js em vez de minificado
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
    };

    emulatorJs.EJS_defaultControls = controlsConfig;
    emulatorJs.EJS_showBottomMenu = showBottomMenu;

    const script = document.createElement("script");
    script.src = "http://localhost:3000/emulatorjs-data/loader.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return <div id="root-demo-game" style={{ width: "240px", height: "160px" }} />;
}

export default Emulator;