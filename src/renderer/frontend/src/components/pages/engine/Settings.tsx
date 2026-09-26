import React, { useEffect, useRef, useState } from 'react';
import { Alert, Dropdown, Layout, Menu, Switch, Radio, Select, Typography, Button, Space, Input, message, Divider, Row, Col, Slider, Tooltip, Flex } from 'antd';
import { PictureOutlined } from '@ant-design/icons';
import useAppContexts from '@/providers/contexts/AppContexts';
import { AntdToken } from '../../common/AntDToken';
import { loadPaletteLibrary } from '../../resourceEditors/paletteLibrary';
import { getPaletteIndexZeroColor, loadPaletteTransparentImage } from '@/utils/paletteTransparency';
import { fontCharacterWidth, fontGlyphIndex, PREVIEW_FONTS, type PreviewFontId } from '@/utils/fontMetrics';

const { Sider, Content } = Layout;
const { Title, Paragraph } = Typography;

const demoFilterOptions = [
  { value: "", label: "Disabled" },
  { value: "2xScaleHQ.glslp", label: "Doubles resolution with smooth edges" },
  { value: "4xScaleHQ.glslp", label: "Quadruples resolution with smooth edges" },
  { value: "crt-aperture.glslp", label: "CRT look with aperture mask effect" },
  { value: "crt-beam", label: "Classic CRT beam simulation" },
  { value: "crt-caligari", label: "Stylized CRT with strong contrast" },
  { value: "crt-easymode.glslp", label: "Lightweight CRT effect, fast performance" },
  { value: "crt-geom.glslp", label: "CRT with curved screen geometry" },
  { value: "crt-lottes", label: "Accurate CRT scanlines and mask" },
  { value: "crt-mattias.glslp", label: "Soft CRT effect with balanced fidelity" },
  { value: "crt-yeetron", label: "Experimental CRT with vivid colors" },
  { value: "crt-zfast", label: "Fast CRT shader optimized for speed" },
  { value: "sabr", label: "Pixel smoothing using SABR algorithm" },
  { value: "bicubic", label: "Bicubic scaling for general smoothing" },
  { value: "mix-frames", label: "Frame blending for smoother motion" }
];

const defaultControls = {
  0: {
      0: { 'value': 'x', 'value2': 'BUTTON_2' },
      1: { 'value': 's', 'value2': 'BUTTON_4' },
      2: { 'value': 'v', 'value2': 'SELECT' },
      3: { 'value': 'Enter', 'value2': 'START' },
      4: { 'value': 'ArrowUp', 'value2': 'DPAD_UP' },
      5: { 'value': 'ArrowDown', 'value2': 'DPAD_DOWN' },
      6: { 'value': 'ArrowLeft', 'value2': 'DPAD_LEFT' },
      7: { 'value': 'ArrowRight', 'value2': 'DPAD_RIGHT' },
      8: { 'value': 'z', 'value2': 'BUTTON_1' },
      9: { 'value': 'a', 'value2': 'BUTTON_3' },
      10: { 'value': 'q', 'value2': 'LEFT_TOP_SHOULDER' },
      11: { 'value': 'e', 'value2': 'RIGHT_TOP_SHOULDER' },
      12: { 'value': 'Tab', 'value2': 'LEFT_BOTTOM_SHOULDER' },
      13: { 'value': 'r', 'value2': 'RIGHT_BOTTOM_SHOULDER' },
      14: { 'value': '', 'value2': 'LEFT_STICK' },
      15: { 'value': '', 'value2': 'RIGHT_STICK' },
      16: { 'value': 'h', 'value2': 'LEFT_STICK_X:+1' },
      17: { 'value': 'f', 'value2': 'LEFT_STICK_X:-1' },
      18: { 'value': 'g', 'value2': 'LEFT_STICK_Y:+1' },
      19: { 'value': 't', 'value2': 'LEFT_STICK_Y:-1' },
      20: { 'value': 'l', 'value2': 'RIGHT_STICK_X:+1' },
      21: { 'value': 'j', 'value2': 'RIGHT_STICK_X:-1' },
      22: { 'value': 'k', 'value2': 'RIGHT_STICK_Y:+1' },
      23: { 'value': 'i', 'value2': 'RIGHT_STICK_Y:-1' },
      24: { 'value': 'undefined' },
      25: { 'value': 'undefined' },
      26: { 'value': 'undefined' },
      27: { 'value': 'F1' },
      28: { 'value': 'F2' },
      29: { 'value': 'F3' },
  },
  1: {},
  2: {},
  3: {}
};

const controlDescriptions: Record<number, string> = {
  0: 'B',
  2: 'SELECT',
  3: 'START',
  4: 'UP',
  5: 'DOWN',
  6: 'LEFT',
  7: 'RIGHT',
  8: 'A',
  10: 'L',
  11: 'R',
  27: 'FAST FORWARD',
  28: 'REWIND',
  29: 'SLOW MOTION'
};

const contentStyle: React.CSSProperties = {
  height: 'calc(100vh - 42px)',
  paddingTop: 20, 
  paddingInline: 20,
  overflowY: 'auto',
  scrollbarWidth: 'thin', 
  scrollbarGutter: 'stable',  
};

const siderStyle: React.CSSProperties = {
  // overflow: 'auto',
  // height: 'calc(100vh - 70px)',
  padding: 20,
  position: 'sticky',
  insetInlineStart: 0,
  top: 0,
  scrollbarWidth: 'thin',
  scrollbarGutter: 'stable',
};

const Settings: React.FC = () => {
  const { settings, setSettings, palettes } = useAppContexts() as any;

  const fadeRef = useRef<HTMLDivElement | null>(null);
  const colorOptionsRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const demoRef = useRef<HTMLDivElement | null>(null);
  const uiElementsRef = useRef<HTMLDivElement | null>(null);
  const fontsRef = useRef<HTMLDivElement | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);

  const [contentFilter, setContentFilter] = useState<string>('');
  const [uiImages, setUiImages] = useState<{ name: string; path: string }[]>([]);
  const [uiImagesPath, setUiImagesPath] = useState('');
  const [fontImages, setFontImages] = useState<{ name: string; path: string }[]>([]);
  const [fontImagesPath, setFontImagesPath] = useState('');
  const [commonFontImages, setCommonFontImages] = useState<Record<string, string>>({});
  const [fontPreviewImages, setFontPreviewImages] = useState<Record<string, string>>({});
  const [fontPaletteColors, setFontPaletteColors] = useState<Record<string, string>>({});
  useEffect(() => {
    let mounted = true;
    void window.electronAPI.fetchImages('ui').then((response: any) => {
      if (!mounted || response?.status !== 'success') return;
      const images = (response.fileImages ?? []).map((name: string) => ({ name, path: `${response.localPath}/${name}` }));
      setUiImages(images);
      setUiImagesPath(response.localPath ?? '');
    }).catch(() => { if (mounted) setUiImages([]); });
    void window.electronAPI.fetchImages('fonts').then((response: any) => {
      if (!mounted || response?.status !== 'success') return;
      const images = (response.fileImages ?? []).map((name: string) => ({ name, path: `${response.localPath}/${name}` }));
      setFontImages(images);
      setFontImagesPath(response.localPath ?? '');
    }).catch(() => { if (mounted) setFontImages([]); });
    void window.electronAPI.getCommonFontImages().then((response: Record<string, string>) => {
      if (mounted && response) setCommonFontImages(response);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    let mounted = true;
    const sources = [
      ...Object.entries(commonFontImages).map(([name, source]) => [name, source] as const),
      ...fontImages.map(image => [`custom:${image.name}`, `${fontImagesPath}/${image.name}`] as const),
    ];
    if (!sources.length) return () => { mounted = false; };

    void Promise.all(sources.map(async ([key, source]) => {
      const canvas = await loadPaletteTransparentImage(source);
      return [key, canvas?.toDataURL('image/png')] as const;
    })).then(results => {
      if (!mounted) return;
      setFontPreviewImages(previous => ({
        ...previous,
        ...Object.fromEntries(results.filter(([, image]) => Boolean(image))),
      }));
    });

    return () => { mounted = false; };
  }, [commonFontImages, fontImages, fontImagesPath]);
  useEffect(() => {
    let mounted = true;
    const sources = [
      ...Object.entries(commonFontImages).map(([name, source]) => [name, source] as const),
      ...fontImages.map(image => [`custom:${image.name}`, `${fontImagesPath}/${image.name}`] as const),
    ];
    void Promise.all(sources.map(async ([key, source]) => [key, await getPaletteIndexZeroColor(source)] as const)).then(results => {
      if (mounted) setFontPaletteColors(Object.fromEntries(results.filter(([, color]) => Boolean(color)) as Array<[string, string]>));
    });
    return () => { mounted = false; };
  }, [commonFontImages, fontImages, fontImagesPath]);
  const menuItems = [
    { key: 'fade', label: 'Fade Options' },
    { key: 'color-options', label: 'Color Options' },
    { key: 'controls', label: 'Controls' },
    { key: 'ui-elements', label: 'UI Elements' },
    { key: 'fonts', label: 'Fonts' },
    { key: 'demo', label: 'Demo Filters' },
  ];

  const matchesContent = (label: string, description: string) => {
    const normalized = contentFilter.trim().toLowerCase();
    if (!normalized) return true;
    return label.toLowerCase().includes(normalized) || description.toLowerCase().includes(normalized);
  };

  const uiImageOptions = uiImages.map(image => ({
    value: image.name,
    title: image.name,
    label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><img src={`${uiImagesPath}/${image.name}`} alt="" style={{ width: 48, height: 48, objectFit: 'contain', imageRendering: 'pixelated' }} />{image.name}</span>,
  }));
  const renderUiImageValue = (value: string | undefined) => {
    if (!value) return <PictureOutlined style={{ fontSize: 28, color: token.colorTextQuaternary }} />;
    return <img src={`${uiImagesPath}/${value}`} alt={value} style={{ display: 'block', width: 64, height: 64, objectFit: 'contain', imageRendering: 'pixelated' }} />;
  };

  const renderUiImagePicker = (value: string | null | undefined, onChange: (nextValue: string | null) => void, label: string) => (
    <Dropdown
      trigger={['click']}
      menu={{
        items: [
          { key: '__default', label: 'Use default image', icon: <PictureOutlined /> },
          ...uiImageOptions.map(option => ({ key: String(option.value), label: option.label })),
        ],
        onClick: ({ key }) => onChange(key === '__default' ? null : key),
      }}
    >
      <Button aria-label={`Select ${label}`} style={{ width: 64, height: 64, minWidth: 64, padding: 0, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {renderUiImageValue(value ?? undefined)}
      </Button>
    </Dropdown>
  );

  const renderMappedFont = (image: string, font: PreviewFontId, text: string, availableWidth = 104, availableHeight = 48) => {
    const metrics = PREVIEW_FONTS[font];
    const textWidth = Array.from(text).reduce((total, character) => total + fontCharacterWidth(font, character), 0);
    const scale = Math.max(1, Math.min(4, availableWidth / Math.max(1, textWidth), availableHeight / metrics.glyphHeight));
    const scaledHeight = metrics.glyphHeight * scale;
    return <span aria-label={text} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', overflow: 'hidden', lineHeight: 0 }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'nowrap', width: 'max-content', maxWidth: '100%', marginInline: 'auto' }}>
      {Array.from(text).map((character, index) => {
        // Butano's mapped font sheets are vertical strips: the first glyph
        // is "!", followed by ASCII and the optional mapped accents.
        const glyph = Math.max(0, fontGlyphIndex(character));
        const scaledGlyphWidth = fontCharacterWidth(font, character) * scale;
        const scaledCellWidth = metrics.glyphWidth * scale;
        return <span key={`${character}-${index}`} style={{ width: scaledGlyphWidth, height: scaledHeight, flex: `0 0 ${scaledGlyphWidth}px`, backgroundImage: `url(${image})`, backgroundRepeat: 'no-repeat', backgroundSize: `${scaledCellWidth}px auto`, backgroundPosition: `0 ${-glyph * scaledHeight}px`, imageRendering: 'pixelated' }} />;
      })}
      </span>
    </span>;
  };
  const fontImageOptions = (font: PreviewFontId) => fontImages.map(image => ({
    value: image.name,
    label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32 }}><span style={{ width: 64, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: fontPaletteColors[`custom:${image.name}`] ?? 'transparent', borderRadius: 4, overflow: 'hidden' }}>{renderMappedFont(`${fontImagesPath}/${image.name}`, font, 'abc', 56, 24)}</span>{image.name}</span>,
  }));
  const renderFontPicker = (value: string | null | undefined, onChange: (nextValue: string | null) => void, label: string, font: PreviewFontId, previewText: string) => {
    const defaultImage = PREVIEW_FONTS[font].image;
    const image = value
      ? fontPreviewImages[`custom:${value}`] ?? `${fontImagesPath}/${value}`
      : fontPreviewImages[defaultImage] ?? commonFontImages[defaultImage] ?? '/common_variable_8x16_font.png';
    return <Dropdown
      trigger={['click']}
      menu={{ items: [{ key: '__default', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32 }}><span style={{ width: 64, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: fontPaletteColors[defaultImage] ?? 'transparent', borderRadius: 4, overflow: 'hidden', opacity: 0.45 }}>{renderMappedFont(commonFontImages[defaultImage] ?? '/common_variable_8x16_font.png', font, 'abc', 56, 24)}</span>Use common default</span> }, ...fontImageOptions(font).map(option => ({ key: String(option.value), label: option.label }))], onClick: ({ key }) => onChange(key === '__default' ? null : key) }}
    >
      <Button aria-label={`Select ${label}`} style={{ width: 118, height: 72, minWidth: 118, minHeight: 72, maxHeight: 72, boxSizing: 'border-box', padding: 2, borderRadius: 6, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <span style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', opacity: value ? 1 : 0.45 }}>{renderMappedFont(image, font, previewText)}</span>
      </Button>
    </Dropdown>;
  };

  const { token } = AntdToken();
  const normalizeControls = (raw: any) => {
    const norm: any = {};
    Object.keys(raw || {}).forEach(player => {
      norm[player] = {};
      Object.keys(raw[player] || {}).forEach(k => {
        const entry = raw[player][k] || {};
        const values: string[] = [];
        Object.keys(entry)
          .filter(field => /^value(\d*)$/.test(field))
          .sort((a, b) => {
            const indexA = a === 'value' ? 1 : parseInt(a.slice(5), 10);
            const indexB = b === 'value' ? 1 : parseInt(b.slice(5), 10);
            return indexA - indexB;
          })
          .forEach(field => {
            const val = entry[field];
            if (typeof val === 'string' && val.length > 0) {
              values.push(val); // val.toLowerCase() to normalize
            }
          });
        norm[player][k] = { ...entry, _values: values };
      });
    });
    return norm;
  };

  const serializeControlEntry = (values: string[]) => {
    const entry: any = {};
    values.forEach((value, index) => {
      if (index === 0) entry.value = value;
      else entry[`value${index + 1}`] = value;
    });
    return entry;
  };

  const serializeControls = (controls: any) => {
    const base: any = {};
    Object.keys(controls || {}).forEach(player => {
      base[player] = {};
      Object.keys(controls[player] || {}).forEach(k => {
        const entry = controls[player][k] || {};
        const values: string[] = entry._values || [];
        base[player][k] = serializeControlEntry(values);
      });
    });
    return base;
  };

  const [controlsObj, setControlsObj] = useState<any>(() => normalizeControls(settings?.controls || defaultControls));

  const [capturing, setCapturing] = useState<{ player: number; idx: number } | null>(null);

  const handleMenuClick = (e: any) => {
    const key = e.key as string;
    const map: Record<string, React.RefObject<HTMLDivElement | null>> = {
      fade: fadeRef,
      'color-options': colorOptionsRef,
      controls: controlsRef,
      demo: demoRef,
      'ui-elements': uiElementsRef,
      fonts: fontsRef,
    };

    const target = map[key];
    if (target?.current && contentScrollRef.current) {
      const container = contentScrollRef.current;
      const targetTop = target.current.offsetTop;
      container.scrollTo({ top: targetTop, behavior: 'smooth' });
    }

    setContentFilter('');
  };

  const markUnsaved = (patch: any) => {
    const next = { ...(settings || {}), ...patch, _saved: false };
    setSettings(next);
  };

  const setControlsAndUnsaved = (updater: (prev: any) => any) => {
    setControlsObj((prev: any) => {
      const next = updater(prev);
      markUnsaved({ controls: serializeControls(next) });
      return next;
    });
  };

  const restoreDefaultControls = () => {
    const norm = normalizeControls(defaultControls);
    setControlsAndUnsaved(() => norm);
    message.success('Defaults restored');
  };

  const updateControlField = (player: number, idx: number, field: string, value: any) => {
    setControlsObj((prev: any) => {
      const next = { ...(prev || {}) };
      if (!next[player]) next[player] = {};
      if (!next[player][idx]) next[player][idx] = {};
      // If editing _values directly
      if (field === '_values') {
        next[player][idx] = { ...(next[player][idx] || {}), _values: value };
      } else {
        next[player][idx] = { ...(next[player][idx] || {}), [field]: value };
      }
      return next;
    });
  };

  // capture key presses when capturing is active
  React.useEffect(() => {
    if (!capturing) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      const key = e.key; // e.key.toLowerCase(); // to lowerCase
      // let action = 'Captured';
      setControlsAndUnsaved((prev: any) => {
        const next = JSON.parse(JSON.stringify(prev || {}));
        const p = String(capturing.player);
        const i = String(capturing.idx);
        if (!next[p]) next[p] = {};
        if (!next[p][i]) next[p][i] = { _values: [] };
        const existingValues: string[] = next[p][i]._values || [];
        const keyExists = existingValues.includes(key);
        // action = keyExists ? 'Removed' : 'Captured';
        next[p][i]._values = keyExists
          ? existingValues.filter((value: string) => value !== key)
          : [...existingValues, key];
        return next;
      });
      
      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement?.blur) {
        activeElement.blur();
      }
      // message.success(`${action}: ${key}`);
      setCapturing(null);
    };

    window.addEventListener('keydown', handler, { once: true });

    return () => window.removeEventListener('keydown', handler);
  }, [capturing]);

  // if settings.controls changes externally, refresh form
  React.useEffect(() => {
    if (settings && settings.controls) {
      setControlsObj(normalizeControls(settings.controls));
    }
  }, [settings && settings.controls]);

  return (
    <Layout hasSider >
      <Sider style={{ ...siderStyle, backgroundColor: token.colorBgLayout }}>
        <Content style={{ borderRadius: token.borderRadius, overflowY: 'auto', maxHeight: 'calc(100vh - 96px)', boxShadow: token.boxShadow }}>
          <Tooltip title="Filter settings by section name or description.">
          <Input.Search
            placeholder="Filter content"
            allowClear
            value={contentFilter}
            onChange={(e) => setContentFilter(e.target.value)}
            onSearch={(value) => setContentFilter(value)}
            style={{ backgroundColor: token.colorBgElevated, padding: 6 }}
          />
          </Tooltip>
          <Menu
            mode="inline"
            selectable={false}
            onClick={handleMenuClick}
            items={menuItems}
            style={{ background: token.colorBgElevated, border: 0 }}
          />
        </Content>
      </Sider>

      <Content ref={contentScrollRef} style={{ ...contentStyle, scrollbarColor: token.colorBgMask + ' transparent', }}>
        <Content style={{ position: 'sticky' }}>
          {matchesContent('Fade Options', 'Escolha a direção do fade entre branco→preto ou preto→branco.') && (
            <Content ref={fadeRef} style={{ padding: 16, borderRadius: token.borderRadius, background: token.colorBgElevated, boxShadow: token.boxShadow, marginBottom: 16 }}>
              <Title level={4}>Fade Options</Title>
              <Paragraph>Chose the direction to fade between white and black.</Paragraph>
              <Space direction="vertical">
                <Tooltip title="Choose the color used by the fade transition."><Select
                  value={(settings && settings.fadeDirection) ?? 0}
                  onChange={(value) => markUnsaved({ fadeDirection: value })}
                  style={{ width: 240 }}
                >
                  <Select.Option value={0}>Fade to white</Select.Option>
                  <Select.Option value={1}>Fade to black</Select.Option>
                </Select></Tooltip>
              </Space>
            </Content>
          )}
          {matchesContent('Color Options', 'Select one of the available palettes for each color slot.') && <Content ref={colorOptionsRef} style={{ padding: 16, borderRadius: token.borderRadius, background: token.colorBgElevated, boxShadow: token.boxShadow, marginBottom: 16 }}>
            <Title level={4}>Color Options</Title>
            <Paragraph>Choose an available palette for each of the 16 color slots.</Paragraph>
            <Row gutter={[8, 8]}>
              {Array.from({ length: 16 }, (_, index) => {
                const paletteIds = Array.isArray((settings as any)?.colorPaletteIds) ? (settings as any).colorPaletteIds : Array(16).fill(undefined);
                const availablePalettes = palettes?.palettes?.length ? palettes.palettes : loadPaletteLibrary();
                return <Col key={index} span={6}><Space direction="vertical" size={2} style={{ width: '100%' }}><Typography.Text type="secondary">Slot {index}</Typography.Text><Tooltip title="Assign a project palette to this hardware palette slot."><Select allowClear placeholder="Select palette" value={paletteIds[index]} onChange={value => { const next = [...paletteIds]; next[index] = value; markUnsaved({ colorPaletteIds: next }); }} style={{ width: '100%' }} popupMatchSelectWidth={320} options={availablePalettes.map((palette: any) => ({ value: palette.id, label: <Space size={4}><span style={{ display: 'inline-flex', gap: 1 }}>{palette.colors.slice(0, 8).map((color: string, position: number) => <span key={position} style={{ width: 7, height: 14, background: color, border: '1px solid rgba(127,127,127,.35)' }} />)}</span>{palette.name}</Space> }))} /></Tooltip></Space></Col>;
              })}
            </Row>
          </Content>}
          {matchesContent('Controls', 'Preencha o formulário abaixo com os valores desejados para cada mapeamento.') && (
            <Content ref={controlsRef} style={{ padding: 16, borderRadius: token.borderRadius, background: token.colorBgElevated, boxShadow: token.boxShadow, marginBottom: 16 }}>
              <Title level={4}>Controls</Title>
              <Paragraph>Setting of the values buttons to map controller of game.</Paragraph>
              <Content>
                  {/* only show configurable indices */}
                  {([8,0,10,11,2,3,4,5,6,7,27,28,29] as number[]).map((idx) => {
                    const entry = (controlsObj[0] && controlsObj[0][idx]) || { _values: [] };
                    const values: string[] = entry._values || [];
                    return (
                      <Content key={`control-${idx}`} style={{ padding: 8, borderRadius: token.borderRadius, background: token.colorFillTertiary, marginBottom: 8 }}>
                      <Row gutter={12} align="middle">
                        <Col span={3}>
                          <Space>
                            {/* <strong>{idx}</strong> */}
                            <Space style={{ fontSize: 11, color: token.colorTextSecondary }}>{controlDescriptions[idx] || ''}</Space>
                          </Space>
                        </Col>
                        <Col span={14}>
                          <Tooltip title="Click, then press a key or controller button to assign it."><Input readOnly value={values.join(', ')} placeholder="(click to capture)" onClick={() => setCapturing({ player: 0, idx })} /></Tooltip>
                        </Col>
                        <Col span={7}>
                          <Space>
                            <Tooltip title="Remove all assignments for this control."><Button onClick={() => { setControlsAndUnsaved((prev:any) => { const next = {...prev}; if(!next[0]) next[0] = {}; next[0][idx] = { ...(next[0][idx]||{}), _values: [] }; return next; }); message.info('Cleared values'); }}>Clear</Button></Tooltip>
                          </Space>
                        </Col>
                      </Row>
                      </Content>
                    );
                  })}
              </Content>
              <Space style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <Tooltip title="Restore the default keyboard and controller mappings."><Button onClick={restoreDefaultControls}>Restore Defaults</Button></Tooltip>
              </Space>
            </Content>
          )}
          {matchesContent('UI Elements', 'Select the cursor and dialogue frame images from the ui folder.') && (
            <Content ref={uiElementsRef} style={{ padding: 16, borderRadius: token.borderRadius, background: token.colorBgElevated, boxShadow: token.boxShadow, marginBottom: 16 }}>
              <Title level={4}>UI Elements</Title>
              <Paragraph>Select the images used by dialogue boxes and choice cursors.</Paragraph>
              <Flex align="flex-start" gap={16} wrap="wrap">
                <Space direction="vertical">
                  <Typography.Text>Cursor Image</Typography.Text>
                  {renderUiImagePicker(settings?.uiCursorImage, value => markUnsaved({ uiCursorImage: value }), 'cursor image')}
                </Space>
                <Space direction="vertical">
                  <Typography.Text>Frame Image</Typography.Text>
                  {renderUiImagePicker(settings?.uiFrameImage, value => markUnsaved({ uiFrameImage: value }), 'dialogue frame image')}
                </Space>
                {uiImages.length === 0 && <Alert type="info" showIcon message="Nenhuma imagem foi encontrada em assets/ui. O build usará cursor.png e frame.png padrão." />}
              </Flex>
            </Content>
          )}
          {matchesContent('Fonts', 'Customize the mapped fonts used by the project.') && (
            <Content ref={fontsRef} style={{ padding: 16, borderRadius: token.borderRadius, background: token.colorBgElevated, boxShadow: token.boxShadow, marginBottom: 16 }}>
              <Title level={4}>Fonts</Title>
              <Paragraph>Select mapped font images from the project assets/fonts folder. The common Butano fonts are used when no image is selected.</Paragraph>
              <Flex align="flex-start" gap={16} wrap="wrap">
                <Space direction="vertical" align="center"><Typography.Text>Font S</Typography.Text>{renderFontPicker(settings?.font8x8Image, value => markUnsaved({ font8x8Image: value }), 'Font S', 'fixed8x8', '8x8')}</Space>
                <Space direction="vertical" align="center"><Typography.Text>Font M</Typography.Text>{renderFontPicker(settings?.font8x16Image, value => markUnsaved({ font8x16Image: value }), 'Font M', 'fixed8x16', '8x16')}</Space>
                <Space direction="vertical" align="center"><Typography.Text>Font S Variables</Typography.Text>{renderFontPicker(settings?.font8x8VariablesImage, value => markUnsaved({ font8x8VariablesImage: value }), 'Font S Variables', 'variable8x8', '8x8v')}</Space>
                <Space direction="vertical" align="center"><Typography.Text>Font M Variables</Typography.Text>{renderFontPicker(settings?.font8x16VariablesImage, value => markUnsaved({ font8x16VariablesImage: value }), 'Font M Variables', 'variable8x16', '8x16v')}</Space>
                <Space direction="vertical" align="center"><Typography.Text>Font L Variables</Typography.Text>{renderFontPicker(settings?.font16x16VariablesImage, value => markUnsaved({ font16x16VariablesImage: value }), 'Font L Variables', 'variable16x16', '16x16v')}</Space>
                {fontImages.length === 0 && <Alert type="info" showIcon message="Nenhuma imagem foi encontrada em assets/fonts. Os fonts common serão usados por padrão." />}
              </Flex>
            </Content>
          )}
          {matchesContent('Demo Filters', 'Demo configuration') && (
            <Content ref={demoRef} style={{ padding: 16, borderRadius: token.borderRadius, background: token.colorBgElevated, boxShadow: token.boxShadow, marginBottom: 16 }}>
              <Title level={4}>Demo configuration</Title>
              <Paragraph>Configure display and audio defaults for the EmulatorJS demo.</Paragraph>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Flex align="center" gap={12} wrap="wrap">
                  <Content>Select filter: </Content>
                  <Tooltip title="Choose the display filter used by the demo emulator.">
                    <Select
                      style={{ width: 300 }}
                      value={(settings && settings.demoFilter) || demoFilterOptions[0].value}
                      onChange={(v) => markUnsaved({ demoFilter: v })}
                      options={demoFilterOptions.map(option => ({ value: option.value, label: option.label }))}
                    />
                  </Tooltip>
                  <Content style={{ paddingLeft: 10 }}>Show FPS: </Content>
                  <Tooltip title="Show the current frame rate in the emulator."><Switch checked={(settings && settings.demoShowFPS) || false} onChange={(v) => markUnsaved({ demoShowFPS: v })} /></Tooltip>
                  <Content style={{ paddingLeft: 10 }}> Show Menu: </Content>
                  <Tooltip title="Show EmulatorJS controls in the demo."><Switch checked={(settings && settings.demoShowMenu) || false} onChange={(v) => markUnsaved({ demoShowMenu: v })} /></Tooltip>
                  {/* <Content style={{ paddingLeft: 10 }}>Show Right Click to License: </Content>
                    <Switch checked={(settings && settings.demoShowLicense) || false} onChange={(v) => markUnsaved({ demoShowLicense: v })} /> */}
                </Flex>
                <Divider style={{ margin: '8px 0' }} />
                <Flex vertical gap={8} style={{ width: '100%', maxWidth: 520 }}>
                  <Flex align="center" justify="space-between" gap={12}>
                    <Typography.Text>Default volume</Typography.Text>
                    <Typography.Text type="secondary">{Math.round((typeof settings?.demoAudioVolume === 'number' ? settings.demoAudioVolume : 1) * 100)}%</Typography.Text>
                  </Flex>
                  <Tooltip title="Set the initial emulator volume. Drag the handle or use the arrow keys for precise changes.">
                    <Slider
                      min={0}
                      max={1}
                      step={0.01}
                      value={typeof settings?.demoAudioVolume === 'number' ? settings.demoAudioVolume : 1}
                      onChange={(value) => markUnsaved({ demoAudioVolume: value })}
                      tooltip={{ formatter: (value) => `${Math.round((value ?? 1) * 100)}%` }}
                      style={{ width: '100%', margin: 0 }}
                    />
                  </Tooltip>
                  <Flex align="center" justify="space-between" gap={12}>
                    <Typography.Text>Start muted</Typography.Text>
                    <Tooltip title="Start the emulator with audio muted, regardless of the default volume.">
                      <Switch checked={settings?.demoAudioMuted ?? false} onChange={(value) => markUnsaved({ demoAudioMuted: value })} />
                    </Tooltip>
                  </Flex>
                </Flex>
              </Space>
            </Content>
          )}
        </Content>
      </Content>
    </Layout>
  );
};

export default Settings;
