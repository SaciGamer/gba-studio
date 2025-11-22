#include "gba_console.h"
#include "gba_video.h"
#include "gba_interrupt.h"
#include "gba_systemcalls.h"
#include "gba_input.h"
#include <stdio.h>

int main(void) {
    // Set up the display
    REG_DISPCNT = MODE_0 | BG0_ON;

    // Set up console
    consoleDemoInit();

    // Print a message
    iprintf("Hello, GBA Studio!\n");

    while (1) {
        VBlankIntrWait();
    }

    return 0;
}