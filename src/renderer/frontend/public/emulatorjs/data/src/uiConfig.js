class EJS_UI_CONFIG {
    constructor(EJS) {
        this.EJS = EJS;
        this.debug = this.EJS.debug;
    }

    log() {
        if (!this.debug) return;
        const args = Array.from(arguments);
        console.log.apply(console, ["[EJS_UI_CONFIG]", ...args]);
    }

    // normalizeMenuShortcut(shortcut) {
    //     if (typeof shortcut !== "string" || !shortcut.trim()) return null;
    //     return shortcut.trim().toLowerCase();
    // }

    checkUISettings() {
        if (!this.debug) return;
        this.log("Checking UI Settings");
        const config = this.EJS.config;

        // defaults
        if (typeof config.showBottomMenu !== "boolean") {
            config.showBottomMenu = !!window.EJS_showBottomMenu;
        }
        // if (!config.menuShortcut) {
        //     config.menuShortcut = this.normalizeMenuShortcut(config.menuShortcut) || "f1";
        // }
    }

}

export { EJS_UI_CONFIG };
