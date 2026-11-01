import { getSettingsSectionAttention } from '@/utils/editorAttention';
import { loadPaletteLibrary } from '../../resourceEditors/paletteLibrary';
import { WarningField } from '../../WarningIndicator';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Dropdown, Layout, Menu, Switch, Radio, Select, Typography, Button, Space, Input, message, Divider, Row, Col, Slider, Tooltip, Flex } from 'antd';
import { LoadingOutlined, PictureOutlined } from '@ant-design/icons';
import useAppContexts from '@/providers/contexts/AppContexts';
import { AntdToken } from '../../common/AntDToken';
import { getPaletteIndexZeroColor, loadPaletteTransparentImage } from '@/utils/paletteTransparency';
import { fontCharacterWidth, fontGlyphIndex, PREVIEW_FONTS, type PreviewFontId } from '@/utils/fontMetrics';
import { InputMapEditor } from '../../RightPanelGWSettings';
import cartridgeShell from '@/img/CartuchoGBASemFundo.png';
import { useI18n } from '@/i18n/I18n';
import DemoControlsEditor from './DemoControlsEditor';
import InputGroupsTable from './InputGroupsTable';
import TilesetAutoTileView from '../../TilesetAutoTileView';
import { loadAutoTileAssets } from '@/utils/autoTileAssets';

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

const demoFilterPreviewStyles: Record<string, { filter?: string; overlay?: string; ghost?: boolean }> = {
  "2xScaleHQ.glslp": { filter: 'contrast(1.12) saturate(1.12)' },
  "4xScaleHQ.glslp": { filter: 'contrast(1.08) saturate(1.08) blur(.2px)' },
  "crt-aperture.glslp": { filter: 'contrast(1.2) saturate(1.2)', overlay: 'repeating-linear-gradient(90deg, #0005 0 1px, transparent 1px 3px), repeating-linear-gradient(0deg, #0005 0 1px, transparent 1px 3px)' },
  "crt-beam": { filter: 'contrast(1.35) brightness(.88) saturate(1.15)', overlay: 'repeating-linear-gradient(0deg, #06102099 0 1px, transparent 1px 3px)' },
  "crt-caligari": { filter: 'contrast(1.65) saturate(1.4) brightness(.9)', overlay: 'radial-gradient(ellipse, transparent 45%, #050714bb 100%), repeating-linear-gradient(0deg, #0005 0 1px, transparent 1px 3px)' },
  "crt-easymode.glslp": { filter: 'contrast(1.15) saturate(1.15)', overlay: 'repeating-linear-gradient(0deg, #0003 0 1px, transparent 1px 3px)' },
  "crt-geom.glslp": { filter: 'contrast(1.25) saturate(1.15)', overlay: 'radial-gradient(ellipse, transparent 58%, #050714cc 100%), repeating-linear-gradient(0deg, #0004 0 1px, transparent 1px 3px)' },
  "crt-lottes": { filter: 'contrast(1.35) saturate(1.25)', overlay: 'repeating-linear-gradient(0deg, #0007 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, #00102266 0 1px, transparent 1px 4px)' },
  "crt-mattias.glslp": { filter: 'contrast(1.12) saturate(1.1) blur(.25px)', overlay: 'repeating-linear-gradient(0deg, #0004 0 1px, transparent 1px 4px)' },
  "crt-yeetron": { filter: 'contrast(1.35) saturate(1.8) hue-rotate(-8deg)', overlay: 'repeating-linear-gradient(0deg, #0005 0 1px, transparent 1px 3px)' },
  "crt-zfast": { filter: 'contrast(1.2) saturate(1.15)', overlay: 'repeating-linear-gradient(0deg, #0005 0 1px, transparent 1px 4px)' },
  sabr: { filter: 'contrast(1.2) saturate(1.1)' },
  bicubic: { filter: 'blur(.35px) saturate(1.05)' },
  "mix-frames": { ghost: true },
};

const renderDemoFilterPreview = (value: string) => {
  const style = demoFilterPreviewStyles[value] ?? {};
  return <span aria-hidden="true" style={{ position: 'relative', display: 'inline-flex', flex: '0 0 72px', width: 72, height: 40, overflow: 'hidden', borderRadius: 4, border: '1px solid #ffffff35', background: '#18233a' }}>
    {style.ghost && <span style={{ position: 'absolute', inset: 0, transform: 'translateX(-3px)', opacity: .38, background: 'linear-gradient(90deg, transparent 35%, #ff6480 35% 61%, transparent 61%)' }} />}
    <span style={{ position: 'absolute', inset: 0, filter: style.filter, background: 'linear-gradient(#4bb8e8 0 58%, #466eb3 58% 100%)' }}>
      <span style={{ position: 'absolute', width: 13, height: 13, borderRadius: '50%', left: 9, top: 6, background: '#ffe57a' }} />
      <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 17, background: 'linear-gradient(135deg, transparent 0 18%, #52a76a 18% 51%, transparent 51%), linear-gradient(45deg, #347b58 0 43%, transparent 43%)' }} />
      <span style={{ position: 'absolute', left: 43, bottom: 7, width: 15, height: 18, background: '#bd5b67', boxShadow: 'inset 3px 0 #e9a56a, inset -3px 0 #813e63' }} />
      <span style={{ position: 'absolute', left: 47, bottom: 11, width: 3, height: 3, background: '#f5e6a4', boxShadow: '6px 0 #f5e6a4' }} />
    </span>
    {style.overlay && <span style={{ position: 'absolute', inset: 0, background: style.overlay }} />}
  </span>;
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
  const { settings, setSettings, scenes, setScenes, palettes, project, setProject, settingUtils, setSettingUtils, userSettings, setUserSettings } = useAppContexts() as any;
  const { t } = useI18n();

  const projectOptionsRef = useRef<HTMLDivElement | null>(null);
  const fadeRef = useRef<HTMLDivElement | null>(null);
  const colorOptionsRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const demoRef = useRef<HTMLDivElement | null>(null);
  const autoTilesRef = useRef<HTMLDivElement | null>(null);
  const uiElementsRef = useRef<HTMLDivElement | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);

  const [contentFilter, setContentFilter] = useState<string>('');
  const [cartridgePreview, setCartridgePreview] = useState<string | null>(null);
  const [selectingCartridgeImage, setSelectingCartridgeImage] = useState(false);
  const [cartridgeHover, setCartridgeHover] = useState(false);
  const [cartridgeAssets, setCartridgeAssets] = useState<Array<{ name: string; source: string }>>([]);
  const [uiImages, setUiImages] = useState<{ name: string; path: string }[]>([]);
  const [uiImagesPath, setUiImagesPath] = useState('');
  const [fontImages, setFontImages] = useState<{ name: string; path: string }[]>([]);
  const [fontImagesPath, setFontImagesPath] = useState('');
  const [commonFontImages, setCommonFontImages] = useState<Record<string, string>>({});
  const [fontPreviewImages, setFontPreviewImages] = useState<Record<string, string>>({});
  const [fontPaletteColors, setFontPaletteColors] = useState<Record<string, string>>({});
  const [assetReloadVersion, setAssetReloadVersion] = useState(0);
  const [autoTileAssets, setAutoTileAssets] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    const reload = () => setAssetReloadVersion(version => version + 1);
    window.addEventListener('gba-studio:assets-reloaded', reload);
    return () => window.removeEventListener('gba-studio:assets-reloaded', reload);
  }, []);
  useEffect(() => {
    let cancelled = false;
    const assetScope = settingUtils?.projectPathFile ?? settingUtils?.localImagePath ?? '';
    if (!assetScope) {
      setAutoTileAssets([]);
      return () => { cancelled = true; };
    }
    loadAutoTileAssets(assetScope).then(assets => {
      if (!cancelled) setAutoTileAssets(assets.map(asset => ({ id: asset.id, name: asset.name })));
    }).catch(error => {
      console.error('Error loading project autotiles:', error);
      if (!cancelled) setAutoTileAssets([]);
    });
    return () => { cancelled = true; };
  }, [settingUtils?.projectPathFile, settingUtils?.localImagePath, assetReloadVersion]);
  useEffect(() => {
    let mounted = true;
    if (!project?.cartridgeImage) {
      setCartridgePreview(null);
      return () => { mounted = false; };
    }
    void window.electronAPI.getCartridgeImage(null, project.cartridgeImage).then((source: string | null) => {
      if (mounted) setCartridgePreview(source);
    }).catch(() => { if (mounted) setCartridgePreview(null); });
    return () => { mounted = false; };
  }, [project?.cartridgeImage]);
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
    void window.electronAPI.fetchImages('cartridge').then(async (response: any) => {
      if (!mounted || response?.status !== 'success') return;
      const assets = await Promise.all((response.fileImages ?? []).map(async (name: string) => ({
        name,
        source: await window.electronAPI.getCartridgeImage(null, name).catch(() => null),
      })));
      if (mounted) setCartridgeAssets(assets.filter((asset: { name: string; source: string | null }) => Boolean(asset.source)) as Array<{ name: string; source: string }>);
    }).catch(() => { if (mounted) setCartridgeAssets([]); });
    void window.electronAPI.getCommonFontImages().then((response: Record<string, string>) => {
      if (mounted && response) setCommonFontImages(response);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [assetReloadVersion]);
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
  const sectionAttention = getSettingsSectionAttention(settings, palettes.palettes.length ? palettes.palettes : loadPaletteLibrary());
  const menuItems = [
    { key: 'project-options', label: t('settings.projectOptions') },
    { key: 'auto-tiles', label: t('tiles.viewAutoTiles') },
    { key: 'fade', label: 'Fade Options' },
    { key: 'color-options', label: 'Color Options' },
    { key: 'controls', label: 'Controls' },
    { key: 'ui-elements', label: 'UI Elements' },
    { key: 'demo', label: t('settings.demoConfiguration') },
  ].map(item => ({ ...item, label: <WarningField overlay warning={Boolean(sectionAttention[item.key])} message={t('events.hierarchyWarning')} style={{ paddingRight: 12 }}>{item.label}</WarningField> }));

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
  const handleMenuClick = (e: any) => {
    const key = e.key as string;
    const map: Record<string, React.RefObject<HTMLDivElement | null>> = {
      fade: fadeRef,
      'color-options': colorOptionsRef,
      controls: controlsRef,
      demo: demoRef,
      'ui-elements': uiElementsRef,
      'auto-tiles': autoTilesRef,
      'project-options': projectOptionsRef,
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

  const setCartridgeImage = (filename: string | null, preview: string | null) => {
    setCartridgePreview(preview);
    setProject((previous: any) => previous ? { ...previous, cartridgeImage: filename, _saved: false } : previous);
  };

  const pickCartridgeImage = async () => {
    setSelectingCartridgeImage(true);
    try {
      const result = await window.electronAPI.selectCartridgeImage();
      if (result?.status === 'success') {
        setCartridgeImage(result.filename, result.dataUrl);
        setCartridgeAssets(previous => [...previous.filter(asset => asset.name !== result.filename), { name: result.filename, source: result.dataUrl }]);
      }
    } catch {
      message.error(t('settings.cartridgeImageError'));
    } finally {
      setSelectingCartridgeImage(false);
    }
  };

  const cartridgeMenuItems = [
    { key: '__default', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><PictureOutlined />{t('settings.useDefaultImage')}</span> },
    { type: 'divider' as const },
    ...cartridgeAssets.map(asset => ({
      key: asset.name,
      label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><img src={asset.source} alt="" style={{ width: 48, height: 26, objectFit: 'cover', borderRadius: 3 }} />{asset.name}</span>,
    })),
    { type: 'divider' as const },
    { key: '__add', icon: <PictureOutlined />, label: t('settings.addCartridgeImage') },
  ];

  const handleCartridgeMenuClick = ({ key }: { key: string }) => {
    if (key === '__default') {
      setCartridgeImage(null, null);
      return;
    }
    if (key === '__add') {
      void pickCartridgeImage();
      return;
    }
    const selected = cartridgeAssets.find(asset => asset.name === key);
    if (selected) setCartridgeImage(selected.name, selected.source);
  };

  const cartridgePreviewContent = (
    <>
      {cartridgePreview
        ? <img src={cartridgePreview} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover', objectPosition: 'center' }} />
        : <span style={{ display: 'flex', width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, lineHeight: 1.2, color: token.colorTextSecondary }}>
            {!selectingCartridgeImage && <><PictureOutlined /><span>{t('settings.cartridgePlaceholder')}</span></>}
          </span>}
      {cartridgePreview && cartridgeHover && !selectingCartridgeImage && <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, lineHeight: 1.2, color: '#fff', background: 'rgba(0,0,0,.58)', pointerEvents: 'none' }}><PictureOutlined style={{ fontSize: 20 }} /><span>{t('settings.replaceCartridgeImage')}</span></span>}
      {selectingCartridgeImage && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}><LoadingOutlined spin style={{ fontSize: 24, color: token.colorPrimary }} /></span>}
    </>
  );

  const cartridgePickerButton = (
    <Button
      type="text"
      aria-label={t('settings.selectCartridgeImage')}
      onMouseEnter={() => setCartridgeHover(true)}
      onMouseLeave={() => setCartridgeHover(false)}
      onClick={cartridgeAssets.length === 0 ? () => { void pickCartridgeImage(); } : undefined}
      style={{ position: 'absolute', left: '14.41%', top: '23.91%', width: '72.03%', height: '63.04%', padding: 0, minWidth: 0, border: 0, borderRadius: 0, overflow: 'hidden', background: 'transparent', boxShadow: 'none' }}
    >
      {cartridgePreviewContent}
    </Button>
  );

  const removeAutoTileSlot = (removedIndex: number, slots: any[]) => {
    setSettings((previous: any) => ({ ...previous, autoTileSlots: slots, _saved: false }));
    setScenes((previous: any[]) => previous.map(scene => {
      if (!scene.backgrounds?.some((layer: any) => layer.autoTileMap)) return scene;
      return {
        ...scene,
        backgrounds: scene.backgrounds.map((layer: any) => layer.autoTileMap
          ? { ...layer, autoTileMap: layer.autoTileMap.map((row: number[]) => row.map(slotIndex => slotIndex === removedIndex ? -1 : slotIndex > removedIndex ? slotIndex - 1 : slotIndex)) }
          : layer),
        _saved: false,
      };
    }));
    setSettingUtils((previous: any) => {
      const selection = previous.selectedAutoTileSlot;
      if (!selection) return previous;
      if (selection.slotIndex === removedIndex) return { ...previous, selectedAutoTileSlot: null };
      return selection.slotIndex > removedIndex
        ? { ...previous, selectedAutoTileSlot: { ...selection, slotIndex: selection.slotIndex - 1 } }
        : previous;
    });
  };

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
          {matchesContent(t('settings.projectOptions'), `${t('settings.projectTitle')} ${t('settings.author')} ${t('settings.cartridgeCover')}`) && (
            <Content ref={projectOptionsRef} style={{ padding: 16, borderRadius: token.borderRadius, background: token.colorBgElevated, boxShadow: token.boxShadow, marginBottom: 16 }}>
              <Title level={4}>{t('settings.projectOptions')}</Title>
              <Paragraph>{t('settings.projectOptionsDescription')}</Paragraph>
              <Row gutter={[20, 20]} align="middle">
                <Col xs={24} md={12}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Typography.Text>{t('settings.projectTitle')}</Typography.Text>
                    <Input
                      aria-label={t('settings.projectTitle')}
                      value={project?.name ?? ''}
                      onChange={event => setProject((previous: any) => previous ? { ...previous, name: event.target.value, _saved: false } : previous)}
                    />
                    <Typography.Text>{t('settings.author')}</Typography.Text>
                    <Input
                      aria-label={t('settings.author')}
                      value={project?.author ?? ''}
                      onChange={event => setProject((previous: any) => previous ? { ...previous, author: event.target.value, _saved: false } : previous)}
                    />
                  </Space>
                </Col>
                <Col xs={24} md={12}>
                  <Space direction="vertical" size={8}>
                    <Typography.Text>{t('settings.cartridgeCover')}</Typography.Text>
                    <div style={{ position: 'relative', width: 'min(100%, 236px)', aspectRatio: '236 / 138', lineHeight: 0 }}>
                      {cartridgeAssets.length > 0
                        ? <Dropdown trigger={['click']} menu={{ items: cartridgeMenuItems, onClick: handleCartridgeMenuClick }}>{cartridgePickerButton}</Dropdown>
                        : cartridgePickerButton}
                      <img src={cartridgeShell} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
                    </div>
                    <Typography.Text type="secondary" style={{ maxWidth: 300 }}>{t('settings.cartridgeCoverHint')}</Typography.Text>
                  </Space>
                </Col>
              </Row>
            </Content>
          )}
          {matchesContent(t('tiles.viewAutoTiles'), t('tiles.projectAutoTileDescription')) && (
            <Content ref={autoTilesRef} style={{ padding: 16, borderRadius: token.borderRadius, background: token.colorBgElevated, boxShadow: token.boxShadow, marginBottom: 16 }}>
              <Title level={4}>{t('tiles.viewAutoTiles')}</Title>
              <Paragraph>{t('tiles.projectAutoTileDescription')}</Paragraph>
              <TilesetAutoTileView
                inlineConfiguration
                slots={settings?.autoTileSlots ?? []}
                autoTiles={autoTileAssets}
                defaultAutoTileId={autoTileAssets[0]?.id}
                onChange={slots => setSettings((previous: any) => ({ ...previous, autoTileSlots: slots, _saved: false }))}
                onRemoveSlot={removeAutoTileSlot}
                zoom={100}
                tilesetViews={userSettings?.tilesetViews ?? {}}
                onUpdateSourceView={(id, patch) => setUserSettings((previous: any) => ({
                  ...previous,
                  _saved: false,
                  tilesetViews: {
                    ...previous.tilesetViews,
                    [id]: { ...(previous.tilesetViews?.[id] ?? { cellSize: 8, zoom: 100, showGrid: true }), ...patch },
                  },
                }))}
                assetReloadVersion={assetReloadVersion}
              />
            </Content>
          )}
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
                const missingPalette = Boolean(paletteIds[index] && !availablePalettes.some(palette => palette.id === paletteIds[index]));
                return <Col key={index} span={6}><Space direction="vertical" size={2} style={{ width: '100%' }}><Typography.Text type="secondary">Slot {index}</Typography.Text><WarningField warning={missingPalette} message={t('settings.missingPalette', { id: paletteIds[index] })}><Tooltip title="Assign a project palette to this hardware palette slot."><Select status={missingPalette ? 'warning' : undefined} allowClear placeholder="Select palette" value={paletteIds[index]} onChange={value => { const next = [...paletteIds]; next[index] = value; markUnsaved({ colorPaletteIds: next }); }} style={{ width: '100%' }} popupMatchSelectWidth={320} options={availablePalettes.map((palette: any) => ({ value: palette.id, label: <Space size={4}><span style={{ display: 'inline-flex', gap: 1 }}>{palette.colors.slice(0, 8).map((color: string, position: number) => <span key={position} style={{ width: 7, height: 14, background: color, border: '1px solid rgba(127,127,127,.35)' }} />)}</span>{palette.name}</Space> }))} /></Tooltip></WarningField></Space></Col>;
              })}
            </Row>
          </Content>}
          {matchesContent('Controls', 'Preencha o formulário abaixo com os valores desejados para cada mapeamento.') && (
            <Content ref={controlsRef} style={{ padding: 16, borderRadius: token.borderRadius, background: token.colorBgElevated, boxShadow: token.boxShadow, marginBottom: 16 }}>
              <Title level={4}>Controls</Title>
              <Paragraph>Setting of the values buttons to map controller of game.</Paragraph>
              <Flex gap={32} align="start" wrap>
                <div style={{ flex: '0 1 360px', minWidth: 280, maxWidth: '100%' }}>
                  <InputMapEditor settings={settings} setSettings={setSettings} />
                </div>
                <div style={{ flex: '1 1 440px', minWidth: 0 }}>
                  <InputGroupsTable value={settings.inputGroups} onChange={inputGroups => markUnsaved({ inputGroups })} />
                </div>
              </Flex>
            </Content>
          )}
          {matchesContent('UI Elements Fonts UI', 'Select the cursor and dialogue frame images from the ui folder. Customize the mapped fonts used by the project.') && (
            <Content ref={uiElementsRef} style={{ padding: 16, borderRadius: token.borderRadius, background: token.colorBgElevated, boxShadow: token.boxShadow, marginBottom: 16 }}>
              <Title level={4}>UI Elements</Title>
              <Title level={5}>UI</Title>
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
              <Divider />
              <Title level={5}>Fonts</Title>
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
          {matchesContent(t('settings.demoConfiguration'), 'Demo Filters Keyboard Control Joystick Control') && (
            <Content ref={demoRef} style={{ padding: 16, borderRadius: token.borderRadius, background: token.colorBgElevated, boxShadow: token.boxShadow, marginBottom: 16 }}>
              <Title level={4}>{t('settings.demoConfiguration')}</Title>
              <Paragraph>Configure display and audio defaults for the EmulatorJS demo.</Paragraph>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Flex align="center" gap={12} wrap="wrap">
                  <Typography.Text>Select filter:</Typography.Text>
                  <Tooltip title="Choose the display filter used by the demo emulator.">
                    <Select
                      style={{ width: 300 }}
                      popupMatchSelectWidth={420}
                      value={(settings && settings.demoFilter) || demoFilterOptions[0].value}
                      onChange={(v) => markUnsaved({ demoFilter: v })}
                      options={demoFilterOptions.map(option => ({ value: option.value, label: option.label }))}
                      optionRender={option => {
                        const value = String(option.value ?? '');
                        const filter = demoFilterOptions.find(item => item.value === value);
                        return <span style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
                          {renderDemoFilterPreview(value)}
                          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                            <Typography.Text>{value || 'Disabled'}</Typography.Text>
                            <Typography.Text type="secondary" style={{ fontSize: 11, lineHeight: 1.2 }}>{filter?.label}</Typography.Text>
                          </span>
                        </span>;
                      }}
                    />
                  </Tooltip>
                  <Typography.Text>Show FPS:</Typography.Text>
                  <Tooltip title="Show the current frame rate in the emulator."><Switch checked={(settings && settings.demoShowFPS) || false} onChange={(v) => markUnsaved({ demoShowFPS: v })} /></Tooltip>
                  <Typography.Text>{t('settings.demoMonitorCPU')}:</Typography.Text>
                  <Tooltip title={t('settings.demoMonitorCPUHint')}><Switch checked={settings?.demoShowCPU === true} onChange={value => markUnsaved({ demoShowCPU: value })} /></Tooltip>
                  <Typography.Text>Show Menu:</Typography.Text>
                  <Tooltip title="Show EmulatorJS controls in the demo."><Switch checked={(settings && settings.demoShowMenu) || false} onChange={(v) => markUnsaved({ demoShowMenu: v })} /></Tooltip>
                  {/* <Content style={{ paddingLeft: 10 }}>Show Right Click to License: </Content>
                    <Switch checked={(settings && settings.demoShowLicense) || false} onChange={(v) => markUnsaved({ demoShowLicense: v })} /> */}
                </Flex>
                <Divider style={{ margin: '8px 0' }} />
                <div style={{ display: 'inline-grid', gridTemplateColumns: 'minmax(0, max-content)', gap: 8, maxWidth: '100%' }}>
                  <Flex align="center" gap={12} style={{ width: 'max-content', maxWidth: '100%' }}>
                    <Typography.Text style={{ whiteSpace: 'nowrap' }}>Default volume:</Typography.Text>
                    <Typography.Text type="secondary" style={{ display: 'inline-grid', flexShrink: 0, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      <span aria-hidden="true" style={{ gridArea: '1 / 1', visibility: 'hidden' }}>100%</span>
                      <span style={{ gridArea: '1 / 1' }}>{Math.round((typeof settings?.demoAudioVolume === 'number' ? settings.demoAudioVolume : 1) * 100)}%</span>
                    </Typography.Text>
                  </Flex>
                  <Tooltip title="Set the initial emulator volume. Drag the handle or use the arrow keys for precise changes.">
                    <Slider
                      min={0}
                      max={1}
                      step={0.01}
                      value={typeof settings?.demoAudioVolume === 'number' ? settings.demoAudioVolume : 1}
                      onChange={(value) => markUnsaved({ demoAudioVolume: value })}
                      tooltip={{ formatter: (value) => `${Math.round((value ?? 1) * 100)}%` }}
                      style={{ width: '100%', margin: 0, contain: 'inline-size' }}
                    />
                  </Tooltip>
                  <Flex align="center" gap={12}>
                    <Typography.Text>{t('settings.demoStartMuted')}</Typography.Text>
                    <Tooltip title={t('settings.demoStartMutedHint')}>
                      <Switch aria-label={t('settings.demoStartMuted')} checked={settings?.demoAudioMuted ?? false} onChange={(value) => markUnsaved({ demoAudioMuted: value })} />
                    </Tooltip>
                  </Flex>
                </div>
              </Space>
              <Divider style={{ margin: '12px 0' }} />
              <DemoControlsEditor controls={settings?.controls} onChange={controls => markUnsaved({ controls })} joystick={settings?.demoJoystick} onJoystickChange={demoJoystick => markUnsaved({ demoJoystick })} />
            </Content>
          )}
        </Content>
      </Content>
    </Layout>
  );
};

export default Settings;
