import { configurarPreferenceHandlers } from "@/handlers/preferenceHandlers";
import { settingsHandlers } from "@/handlers/settingsHandlers";

 const initializeIpcHandlers = (): void => {
    // Funções preferences com handle
    configurarPreferenceHandlers();
    
    // Settings Handlers
    settingsHandlers();
}

export default initializeIpcHandlers;