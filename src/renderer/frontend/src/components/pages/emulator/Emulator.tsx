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

export default function Emulator() {
  const { token } = AntdToken();

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split("?")[1]);
    const romPath = params.get("rom");
    const gameId = romPath?.split("/").pop()?.replace(/\.[^/.]+$/, "");

    // (window as any).EJS_alignStartButton = "center"; // top | center | bottom // StartButtom
    (window as any).EJS_player = "#root";
    (window as any).EJS_core = "gba";
    (window as any).EJS_color = token.colorPrimary;
    (window as any).EJS_backgroundColor = token.colorBgContainer;
    (window as any).EJS_pathtodata = "/emulatorjs/data/";
    (window as any).EJS_gameUrl = romPath;

    // (window as any).EJS_shaders = { 
    //   "crt-easymode.glslp": {
    //     "shader": {
    //         "type": "text",
    //         "value": "shaders = 1\n\nshader0 = crt-easymode.glsl\nfilter_linear0 = false\n",
    //     },
    //     "resources": [
    //         {
    //             "name": "crt-easymode.glsl",
    //             "type": "base64",
    //             "value": "LyoKICAgIENSVCBTaGFkZXIgYnkgRWFzeU1vZGUKICAgIExpY2Vuc2U6IEdQTAoKICAgIEEgZmxhdCBDUlQgc2hhZGVyIGlkZWFsbHkgZm9yIDEwODBwIG9yIGhpZ2hlciBkaXNwbGF5cy4KCiAgICBSZWNvbW1lbmRlZCBTZXR0aW5nczoKCiAgICBWaWRlbwogICAgLSBBc3BlY3QgUmF0aW86ICA0OjMKICAgIC0gSW50ZWdlciBTY2FsZTogT2ZmCgogICAgU2hhZGVyCiAgICAtIEZpbHRlcjogTmVhcmVzdAogICAgLSBTY2FsZTogIERvbid0IENhcmUKCiAgICBFeGFtcGxlIFJHQiBNYXNrIFBhcmFtZXRlciBTZXR0aW5nczoKCiAgICBBcGVydHVyZSBHcmlsbGUgKERlZmF1bHQpCiAgICAtIERvdCBXaWR0aDogIDEKICAgIC0gRG90IEhlaWdodDogMQogICAgLSBTdGFnZ2VyOiAgICAwCgogICAgTG90dGVzJyBTaGFkb3cgTWFzawogICAgLSBEb3QgV2lkdGg6ICAyCiAgICAtIERvdCBIZWlnaHQ6IDEKICAgIC0gU3RhZ2dlcjogICAgMwoqLwoKLy8gUGFyYW1ldGVyIGxpbmVzIGdvIGhlcmU6CiNwcmFnbWEgcGFyYW1ldGVyIFNIQVJQTkVTU19IICJTaGFycG5lc3MgSG9yaXpvbnRhbCIgMC41IDAuMCAxLjAgMC4wNQojcHJhZ21hIHBhcmFtZXRlciBTSEFSUE5FU1NfViAiU2hhcnBuZXNzIFZlcnRpY2FsIiAxLjAgMC4wIDEuMCAwLjA1CiNwcmFnbWEgcGFyYW1ldGVyIE1BU0tfU1RSRU5HVEggIk1hc2sgU3RyZW5ndGgiIDAuMyAwLjAgMS4wIDAuMDEKI3ByYWdtYSBwYXJhbWV0ZXIgTUFTS19ET1RfV0lEVEggIk1hc2sgRG90IFdpZHRoIiAxLjAgMS4wIDEwMC4wIDEuMAojcHJhZ21hIHBhcmFtZXRlciBNQVNLX0RPVF9IRUlHSFQgIk1hc2sgRG90IEhlaWdodCIgMS4wIDEuMCAxMDAuMCAxLjAKI3ByYWdtYSBwYXJhbWV0ZXIgTUFTS19TVEFHR0VSICJNYXNrIFN0YWdnZXIiIDAuMCAwLjAgMTAwLjAgMS4wCiNwcmFnbWEgcGFyYW1ldGVyIE1BU0tfU0laRSAiTWFzayBTaXplIiAxLjAgMS4wIDEwMC4wIDEuMAojcHJhZ21hIHBhcmFtZXRlciBTQ0FOTElORV9TVFJFTkdUSCAiU2NhbmxpbmUgU3RyZW5ndGgiIDEuMCAwLjAgMS4wIDAuMDUKI3ByYWdtYSBwYXJhbWV0ZXIgU0NBTkxJTkVfQkVBTV9XSURUSF9NSU4gIlNjYW5saW5lIEJlYW0gV2lkdGggTWluLiIgMS41IDAuNSA1LjAgMC41CiNwcmFnbWEgcGFyYW1ldGVyIFNDQU5MSU5FX0JFQU1fV0lEVEhfTUFYICJTY2FubGluZSBCZWFtIFdpZHRoIE1heC4iIDEuNSAwLjUgNS4wIDAuNQojcHJhZ21hIHBhcmFtZXRlciBTQ0FOTElORV9CUklHSFRfTUlOICJTY2FubGluZSBCcmlnaHRuZXNzIE1pbi4iIDAuMzUgMC4wIDEuMCAwLjA1CiNwcmFnbWEgcGFyYW1ldGVyIFNDQU5MSU5FX0JSSUdIVF9NQVggIlNjYW5saW5lIEJyaWdodG5lc3MgTWF4LiIgMC42NSAwLjAgMS4wIDAuMDUKI3ByYWdtYSBwYXJhbWV0ZXIgU0NBTkxJTkVfQ1VUT0ZGICJTY2FubGluZSBDdXRvZmYiIDQwMC4wIDEuMCAxMDAwLjAgMS4wCiNwcmFnbWEgcGFyYW1ldGVyIEdBTU1BX0lOUFVUICJHYW1tYSBJbnB1dCIgMi4wIDAuMSA1LjAgMC4xCiNwcmFnbWEgcGFyYW1ldGVyIEdBTU1BX09VVFBVVCAiR2FtbWEgT3V0cHV0IiAxLjggMC4xIDUuMCAwLjEKI3ByYWdtYSBwYXJhbWV0ZXIgQlJJR0hUX0JPT1NUICJCcmlnaHRuZXNzIEJvb3N0IiAxLjIgMS4wIDIuMCAwLjAxCiNwcmFnbWEgcGFyYW1ldGVyIERJTEFUSU9OICJEaWxhdGlvbiIgMS4wIDAuMCAxLjAgMS4wCgojaWYgZGVmaW5lZChWRVJURVgpCgojaWYgX19WRVJTSU9OX18gPj0gMTMwCiNkZWZpbmUgQ09NUEFUX1ZBUllJTkcgb3V0CiNkZWZpbmUgQ09NUEFUX0FUVFJJQlVURSBpbgojZGVmaW5lIENPTVBBVF9URVhUVVJFIHRleHR1cmUKI2Vsc2UKI2RlZmluZSBDT01QQVRfVkFSWUlORyB2YXJ5aW5nIAojZGVmaW5lIENPTVBBVF9BVFRSSUJVVEUgYXR0cmlidXRlIAojZGVmaW5lIENPTVBBVF9URVhUVVJFIHRleHR1cmUyRAojZW5kaWYKCiNpZmRlZiBHTF9FUwojZGVmaW5lIENPTVBBVF9QUkVDSVNJT04gbWVkaXVtcAojZWxzZQojZGVmaW5lIENPTVBBVF9QUkVDSVNJT04KI2VuZGlmCgpDT01QQVRfQVRUUklCVVRFIHZlYzQgVmVydGV4Q29vcmQ7CkNPTVBBVF9BVFRSSUJVVEUgdmVjNCBDT0xPUjsKQ09NUEFUX0FUVFJJQlVURSB2ZWM0IFRleENvb3JkOwpDT01QQVRfVkFSWUlORyB2ZWM0IENPTDA7CkNPTVBBVF9WQVJZSU5HIHZlYzQgVEVYMDsKCnZlYzQgX29Qb3NpdGlvbjE7IAp1bmlmb3JtIG1hdDQgTVZQTWF0cml4Owp1bmlmb3JtIENPTVBBVF9QUkVDSVNJT04gaW50IEZyYW1lRGlyZWN0aW9uOwp1bmlmb3JtIENPTVBBVF9QUkVDSVNJT04gaW50IEZyYW1lQ291bnQ7CnVuaWZvcm0gQ09NUEFUX1BSRUNJU0lPTiB2ZWMyIE91dHB1dFNpemU7CnVuaWZvcm0gQ09NUEFUX1BSRUNJU0lPTiB2ZWMyIFRleHR1cmVTaXplOwp1bmlmb3JtIENPTVBBVF9QUkVDSVNJT04gdmVjMiBJbnB1dFNpemU7Cgp2b2lkIG1haW4oKQp7CiAgICBnbF9Qb3NpdGlvbiA9IE1WUE1hdHJpeCAqIFZlcnRleENvb3JkOwogICAgQ09MMCA9IENPTE9SOwogICAgVEVYMC54eSA9IFRleENvb3JkLnh5Owp9CgojZWxpZiBkZWZpbmVkKEZSQUdNRU5UKQoKI2lmIF9fVkVSU0lPTl9fID49IDEzMAojZGVmaW5lIENPTVBBVF9WQVJZSU5HIGluCiNkZWZpbmUgQ09NUEFUX1RFWFRVUkUgdGV4dHVyZQpvdXQgdmVjNCBGcmFnQ29sb3I7CiNlbHNlCiNkZWZpbmUgQ09NUEFUX1ZBUllJTkcgdmFyeWluZwojZGVmaW5lIEZyYWdDb2xvciBnbF9GcmFnQ29sb3IKI2RlZmluZSBDT01QQVRfVEVYVFVSRSB0ZXh0dXJlMkQKI2VuZGlmCgojaWZkZWYgR0xfRVMKI2lmZGVmIEdMX0ZSQUdNRU5UX1BSRUNJU0lPTl9ISUdICnByZWNpc2lvbiBoaWdocCBmbG9hdDsKI2Vsc2UKcHJlY2lzaW9uIG1lZGl1bXAgZmxvYXQ7CnByZWNpc2lvbiBtZWRpdW1wIGludDsKI2VuZGlmCiNkZWZpbmUgQ09NUEFUX1BSRUNJU0lPTiBtZWRpdW1wCiNlbHNlCiNkZWZpbmUgQ09NUEFUX1BSRUNJU0lPTgojZW5kaWYKCnVuaWZvcm0gQ09NUEFUX1BSRUNJU0lPTiBpbnQgRnJhbWVEaXJlY3Rpb247CnVuaWZvcm0gQ09NUEFUX1BSRUNJU0lPTiBpbnQgRnJhbWVDb3VudDsKdW5pZm9ybSBDT01QQVRfUFJFQ0lTSU9OIHZlYzIgT3V0cHV0U2l6ZTsKdW5pZm9ybSBDT01QQVRfUFJFQ0lTSU9OIHZlYzIgVGV4dHVyZVNpemU7CnVuaWZvcm0gQ09NUEFUX1BSRUNJU0lPTiB2ZWMyIElucHV0U2l6ZTsKdW5pZm9ybSBzYW1wbGVyMkQgVGV4dHVyZTsKQ09NUEFUX1ZBUllJTkcgdmVjNCBURVgwOwoKI2RlZmluZSBGSVgoYykgbWF4KGFicyhjKSwgMWUtNSkKI2RlZmluZSBQSSAzLjE0MTU5MjY1MzU4OQoKI2RlZmluZSBURVgyRChjKSBkaWxhdGUoQ09NUEFUX1RFWFRVUkUoVGV4dHVyZSwgYykpCgovLyBjb21wYXRpYmlsaXR5ICNkZWZpbmVzCiNkZWZpbmUgU291cmNlIFRleHR1cmUKI2RlZmluZSB2VGV4Q29vcmQgVEVYMC54eQoKI2RlZmluZSBTb3VyY2VTaXplIHZlYzQoVGV4dHVyZVNpemUsIDEuMCAvIFRleHR1cmVTaXplKSAvL2VpdGhlciBUZXh0dXJlU2l6ZSBvciBJbnB1dFNpemUKI2RlZmluZSBvdXRzaXplIHZlYzQoT3V0cHV0U2l6ZSwgMS4wIC8gT3V0cHV0U2l6ZSkKCiNpZmRlZiBQQVJBTUVURVJfVU5JRk9STQovLyBBbGwgcGFyYW1ldGVyIGZsb2F0cyBuZWVkIHRvIGhhdmUgQ09NUEFUX1BSRUNJU0lPTiBpbiBmcm9udCBvZiB0aGVtCnVuaWZvcm0gQ09NUEFUX1BSRUNJU0lPTiBmbG9hdCBTSEFSUE5FU1NfSDsKdW5pZm9ybSBDT01QQVRfUFJFQ0lTSU9OIGZsb2F0IFNIQVJQTkVTU19WOwp1bmlmb3JtIENPTVBBVF9QUkVDSVNJT04gZmxvYXQgTUFTS19TVFJFTkdUSDsKdW5pZm9ybSBDT01QQVRfUFJFQ0lTSU9OIGZsb2F0IE1BU0tfRE9UX1dJRFRIOwp1bmlmb3JtIENPTVBBVF9QUkVDSVNJT04gZmxvYXQgTUFTS19ET1RfSEVJR0hUOwp1bmlmb3JtIENPTVBBVF9QUkVDSVNJT04gZmxvYXQgTUFTS19TVEFHR0VSOwp1bmlmb3JtIENPTVBBVF9QUkVDSVNJT04gZmxvYXQgTUFTS19TSVpFOwp1bmlmb3JtIENPTVBBVF9QUkVDSVNJT04gZmxvYXQgU0NBTkxJTkVfU1RSRU5HVEg7CnVuaWZvcm0gQ09NUEFUX1BSRUNJU0lPTiBmbG9hdCBTQ0FOTElORV9CRUFNX1dJRFRIX01JTjsKdW5pZm9ybSBDT01QQVRfUFJFQ0lTSU9OIGZsb2F0IFNDQU5MSU5FX0JFQU1fV0lEVEhfTUFYOwp1bmlmb3JtIENPTVBBVF9QUkVDSVNJT04gZmxvYXQgU0NBTkxJTkVfQlJJR0hUX01JTjsKdW5pZm9ybSBDT01QQVRfUFJFQ0lTSU9OIGZsb2F0IFNDQU5MSU5FX0JSSUdIVF9NQVg7CnVuaWZvcm0gQ09NUEFUX1BSRUNJU0lPTiBmbG9hdCBTQ0FOTElORV9DVVRPRkY7CnVuaWZvcm0gQ09NUEFUX1BSRUNJU0lPTiBmbG9hdCBHQU1NQV9JTlBVVDsKdW5pZm9ybSBDT01QQVRfUFJFQ0lTSU9OIGZsb2F0IEdBTU1BX09VVFBVVDsKdW5pZm9ybSBDT01QQVRfUFJFQ0lTSU9OIGZsb2F0IEJSSUdIVF9CT09TVDsKdW5pZm9ybSBDT01QQVRfUFJFQ0lTSU9OIGZsb2F0IERJTEFUSU9OOwojZWxzZQojZGVmaW5lIFNIQVJQTkVTU19IIDAuNQojZGVmaW5lIFNIQVJQTkVTU19WIDEuMAojZGVmaW5lIE1BU0tfU1RSRU5HVEggMC4zCiNkZWZpbmUgTUFTS19ET1RfV0lEVEggMS4wCiNkZWZpbmUgTUFTS19ET1RfSEVJR0hUIDEuMAojZGVmaW5lIE1BU0tfU1RBR0dFUiAwLjAKI2RlZmluZSBNQVNLX1NJWkUgMS4wCiNkZWZpbmUgU0NBTkxJTkVfU1RSRU5HVEggMS4wCiNkZWZpbmUgU0NBTkxJTkVfQkVBTV9XSURUSF9NSU4gMS41CiNkZWZpbmUgU0NBTkxJTkVfQkVBTV9XSURUSF9NQVggMS41CiNkZWZpbmUgU0NBTkxJTkVfQlJJR0hUX01JTiAwLjM1CiNkZWZpbmUgU0NBTkxJTkVfQlJJR0hUX01BWCAwLjY1CiNkZWZpbmUgU0NBTkxJTkVfQ1VUT0ZGIDQwMC4wCiNkZWZpbmUgR0FNTUFfSU5QVVQgMi4wCiNkZWZpbmUgR0FNTUFfT1VUUFVUIDEuOAojZGVmaW5lIEJSSUdIVF9CT09TVCAxLjIKI2RlZmluZSBESUxBVElPTiAxLjAKI2VuZGlmCgovLyBTZXQgdG8gMCB0byB1c2UgbGluZWFyIGZpbHRlciBhbmQgZ2FpbiBzcGVlZAojZGVmaW5lIEVOQUJMRV9MQU5DWk9TIDEKCnZlYzQgZGlsYXRlKHZlYzQgY29sKQp7CiAgICB2ZWM0IHggPSBtaXgodmVjNCgxLjApLCBjb2wsIERJTEFUSU9OKTsKCiAgICByZXR1cm4gY29sICogeDsKfQoKZmxvYXQgY3VydmVfZGlzdGFuY2UoZmxvYXQgeCwgZmxvYXQgc2hhcnApCnsKCi8qCiAgICBhcHBseSBoYWxmLWNpcmNsZSBzLWN1cnZlIHRvIGRpc3RhbmNlIGZvciBzaGFycGVyIChtb3JlIHBpeGVsYXRlZCkgaW50ZXJwb2xhdGlvbgogICAgc2luZ2xlIGxpbmUgZm9ybXVsYSBmb3IgR3JhcGggVG95OgogICAgMC41IC0gc3FydCgwLjI1IC0gKHggLSBzdGVwKDAuNSwgeCkpICogKHggLSBzdGVwKDAuNSwgeCkpKSAqIHNpZ24oMC41IC0geCkKKi8KCiAgICBmbG9hdCB4X3N0ZXAgPSBzdGVwKDAuNSwgeCk7CiAgICBmbG9hdCBjdXJ2ZSA9IDAuNSAtIHNxcnQoMC4yNSAtICh4IC0geF9zdGVwKSAqICh4IC0geF9zdGVwKSkgKiBzaWduKDAuNSAtIHgpOwoKICAgIHJldHVybiBtaXgoeCwgY3VydmUsIHNoYXJwKTsKfQoKbWF0NCBnZXRfY29sb3JfbWF0cml4KHZlYzIgY28sIHZlYzIgZHgpCnsKICAgIHJldHVybiBtYXQ0KFRFWDJEKGNvIC0gZHgpLCBURVgyRChjbyksIFRFWDJEKGNvICsgZHgpLCBURVgyRChjbyArIDIuMCAqIGR4KSk7Cn0KCnZlYzMgZmlsdGVyX2xhbmN6b3ModmVjNCBjb2VmZnMsIG1hdDQgY29sb3JfbWF0cml4KQp7CiAgICB2ZWM0IGNvbCAgICAgICAgPSBjb2xvcl9tYXRyaXggKiBjb2VmZnM7CiAgICB2ZWM0IHNhbXBsZV9taW4gPSBtaW4oY29sb3JfbWF0cml4WzFdLCBjb2xvcl9tYXRyaXhbMl0pOwogICAgdmVjNCBzYW1wbGVfbWF4ID0gbWF4KGNvbG9yX21hdHJpeFsxXSwgY29sb3JfbWF0cml4WzJdKTsKCiAgICBjb2wgPSBjbGFtcChjb2wsIHNhbXBsZV9taW4sIHNhbXBsZV9tYXgpOwoKICAgIHJldHVybiBjb2wucmdiOwp9Cgp2b2lkIG1haW4oKQp7CiAgICB2ZWMyIGR4ICAgICA9IHZlYzIoU291cmNlU2l6ZS56LCAwLjApOwogICAgdmVjMiBkeSAgICAgPSB2ZWMyKDAuMCwgU291cmNlU2l6ZS53KTsKICAgIHZlYzIgcGl4X2NvID0gdlRleENvb3JkICogU291cmNlU2l6ZS54eSAtIHZlYzIoMC41LCAwLjUpOwogICAgdmVjMiB0ZXhfY28gPSAoZmxvb3IocGl4X2NvKSArIHZlYzIoMC41LCAwLjUpKSAqIFNvdXJjZVNpemUuenc7CiAgICB2ZWMyIGRpc3QgICA9IGZyYWN0KHBpeF9jbyk7CiAgICBmbG9hdCBjdXJ2ZV94OwogICAgdmVjMyBjb2wsIGNvbDI7CgojaWYgRU5BQkxFX0xBTkNaT1MKICAgIGN1cnZlX3ggPSBjdXJ2ZV9kaXN0YW5jZShkaXN0LngsIFNIQVJQTkVTU19IICogU0hBUlBORVNTX0gpOwoKICAgIHZlYzQgY29lZmZzID0gUEkgKiB2ZWM0KDEuMCArIGN1cnZlX3gsIGN1cnZlX3gsIDEuMCAtIGN1cnZlX3gsIDIuMCAtIGN1cnZlX3gpOwoKICAgIGNvZWZmcyA9IEZJWChjb2VmZnMpOwogICAgY29lZmZzID0gMi4wICogc2luKGNvZWZmcykgKiBzaW4oY29lZmZzICogMC41KSAvIChjb2VmZnMgKiBjb2VmZnMpOwogICAgY29lZmZzIC89IGRvdChjb2VmZnMsIHZlYzQoMS4wKSk7CgogICAgY29sICA9IGZpbHRlcl9sYW5jem9zKGNvZWZmcywgZ2V0X2NvbG9yX21hdHJpeCh0ZXhfY28sIGR4KSk7CiAgICBjb2wyID0gZmlsdGVyX2xhbmN6b3MoY29lZmZzLCBnZXRfY29sb3JfbWF0cml4KHRleF9jbyArIGR5LCBkeCkpOwojZWxzZQogICAgY3VydmVfeCA9IGN1cnZlX2Rpc3RhbmNlKGRpc3QueCwgU0hBUlBORVNTX0gpOwoKICAgIGNvbCAgPSBtaXgoVEVYMkQodGV4X2NvKS5yZ2IsICAgICAgVEVYMkQodGV4X2NvICsgZHgpLnJnYiwgICAgICBjdXJ2ZV94KTsKICAgIGNvbDIgPSBtaXgoVEVYMkQodGV4X2NvICsgZHkpLnJnYiwgVEVYMkQodGV4X2NvICsgZHggKyBkeSkucmdiLCBjdXJ2ZV94KTsKI2VuZGlmCgogICAgY29sID0gbWl4KGNvbCwgY29sMiwgY3VydmVfZGlzdGFuY2UoZGlzdC55LCBTSEFSUE5FU1NfVikpOwogICAgY29sID0gcG93KGNvbCwgdmVjMyhHQU1NQV9JTlBVVCAvIChESUxBVElPTiArIDEuMCkpKTsKCiAgICBmbG9hdCBsdW1hICAgICAgICA9IGRvdCh2ZWMzKDAuMjEyNiwgMC43MTUyLCAwLjA3MjIpLCBjb2wpOwogICAgZmxvYXQgYnJpZ2h0ICAgICAgPSAobWF4KGNvbC5yLCBtYXgoY29sLmcsIGNvbC5iKSkgKyBsdW1hKSAqIDAuNTsKICAgIGZsb2F0IHNjYW5fYnJpZ2h0ID0gY2xhbXAoYnJpZ2h0LCBTQ0FOTElORV9CUklHSFRfTUlOLCBTQ0FOTElORV9CUklHSFRfTUFYKTsKICAgIGZsb2F0IHNjYW5fYmVhbSAgID0gY2xhbXAoYnJpZ2h0ICogU0NBTkxJTkVfQkVBTV9XSURUSF9NQVgsIFNDQU5MSU5FX0JFQU1fV0lEVEhfTUlOLCBTQ0FOTElORV9CRUFNX1dJRFRIX01BWCk7CiAgICBmbG9hdCBzY2FuX3dlaWdodCA9IDEuMCAtIHBvdyhjb3ModlRleENvb3JkLnkgKiAyLjAgKiBQSSAqIFNvdXJjZVNpemUueSkgKiAwLjUgKyAwLjUsIHNjYW5fYmVhbSkgKiBTQ0FOTElORV9TVFJFTkdUSDsKCiAgICBmbG9hdCBtYXNrICAgPSAxLjAgLSBNQVNLX1NUUkVOR1RIOyAgICAKICAgIHZlYzIgbW9kX2ZhYyA9IGZsb29yKHZUZXhDb29yZCAqIG91dHNpemUueHkgKiBTb3VyY2VTaXplLnh5IC8gKElucHV0U2l6ZS54eSAqIHZlYzIoTUFTS19TSVpFLCBNQVNLX0RPVF9IRUlHSFQgKiBNQVNLX1NJWkUpKSk7CiAgICBpbnQgZG90X25vICAgPSBpbnQobW9kKChtb2RfZmFjLnggKyBtb2QobW9kX2ZhYy55LCAyLjApICogTUFTS19TVEFHR0VSKSAvIE1BU0tfRE9UX1dJRFRILCAzLjApKTsKICAgIHZlYzMgbWFza193ZWlnaHQ7CgogICAgaWYgICAgICAoZG90X25vID09IDApIG1hc2tfd2VpZ2h0ID0gdmVjMygxLjAsICBtYXNrLCBtYXNrKTsKICAgIGVsc2UgaWYgKGRvdF9ubyA9PSAxKSBtYXNrX3dlaWdodCA9IHZlYzMobWFzaywgMS4wLCAgbWFzayk7CiAgICBlbHNlICAgICAgICAgICAgICAgICAgbWFza193ZWlnaHQgPSB2ZWMzKG1hc2ssIG1hc2ssIDEuMCk7CgogICAgaWYgKElucHV0U2l6ZS55ID49IFNDQU5MSU5FX0NVVE9GRikgCiAgICAgICAgc2Nhbl93ZWlnaHQgPSAxLjA7CgogICAgY29sMiA9IGNvbC5yZ2I7CiAgICBjb2wgKj0gdmVjMyhzY2FuX3dlaWdodCk7CiAgICBjb2wgID0gbWl4KGNvbCwgY29sMiwgc2Nhbl9icmlnaHQpOwogICAgY29sICo9IG1hc2tfd2VpZ2h0OwogICAgY29sICA9IHBvdyhjb2wsIHZlYzMoMS4wIC8gR0FNTUFfT1VUUFVUKSk7CgogICAgRnJhZ0NvbG9yID0gdmVjNChjb2wgKiBCUklHSFRfQk9PU1QsIDEuMCk7Cn0gCiNlbmRpZgo=",
    //         },
    //     ],
    // }};
    (window as any).EJS_startOnLoaded = true;
    (window as any).EJS_hideSettings = [/*'fps',*/ 'videoRotation', 'vsync', 'webgl2Enabled'];
    (window as any).EJS_Buttons = {
      // restart: false,
      // playPause: false,
      screenshot: false,
      screenRecord: false,
      quickSave: false,
      quickLoad: false,
      
      saveState: false,
      loadState: false,
      
      gamepad: false, //TODO Inserir uma configuração e carregar assim que abrir o emulador
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
      // exitEmulation: false,
      exitEmulation: {
        visible: true,
        displayName: "Exit Demo",
        // icon: '<svg viewBox="0 0 320 512"><path d="M361 215C375.3 223.8 384 239.3 384 256C384 272.7 375.3 288.2 361 296.1L73.03 472.1C58.21 482 39.66 482.4 24.52 473.9C9.377 465.4 0 449.4 0 432V80C0 62.64 9.377 46.63 24.52 38.13C39.66 29.64 58.21 29.99 73.03 39.04L361 215z"/></svg>',
        callback: () => {
          window.electronAPI.send('stop-emulator', null); 
          console.log('..: Emulator.tsx Stop emulator')
        }
      },
    };
    (window as any).EJS_askBeforeExit = false;
    (window as any).EJS_gameID = gameId;        // evita conflito de saves e netplay
    (window as any).EJS_language = "pt";        // força idioma correto
    (window as any).EJS_DEBUG_XX = true;        // força usar emulator.js em vez de minificado

    (window as any).EJS_onExit = { callback: () => {
        window.electronAPI.send('stop-emulator', null); 
        console.log('..: Emulator.tsx Stop emulator')
      }
    };

    (window as any).EJS_defaultOptions = {
      'shader':'crt-easymode.glslp',
      'fps': 'show', // show | hide
      'menu-bar-button': "invisible"
    };

    (window as any).EJS_defaultControls = defaultControls;

    const script = document.createElement("script");
    script.src = "/emulatorjs/data/loader.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return;

  // return <div id="game" style={{ width: "240px", height: "160px" }} />;
}