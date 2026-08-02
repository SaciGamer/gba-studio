import React, { useRef, useState } from 'react';
import { Layout, Menu, Switch, Radio, Select, Typography, Button, Space, Input, message, Divider, Row, Col } from 'antd';
import useAppContexts from '@/providers/contexts/AppContexts';
import { AntdToken } from '../../common/AntDToken';

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

const siderStyle: React.CSSProperties = {
//   overflow: 'auto',
//   height: '100vh',
//   position: 'sticky',
  insetInlineStart: 0,
  top: 0,
  bottom: 0,
  border: 0,
  scrollbarWidth: 'thin',
  scrollbarGutter: 'stable',
  marginLeft: 20,
};

const Settings: React.FC = () => {
  const { settings, setSettings } = useAppContexts() as any;

  const fadeRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const demoRef = useRef<HTMLDivElement | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);

  const [contentFilter, setContentFilter] = useState<string>('');
  const menuItems = [
    { key: 'fade', label: 'Fade Options' },
    { key: 'controls', label: 'Controls' },
    { key: 'demo', label: 'Demo Filters' },
  ];

  const matchesContent = (label: string, description: string) => {
    const normalized = contentFilter.trim().toLowerCase();
    if (!normalized) return true;
    return label.toLowerCase().includes(normalized) || description.toLowerCase().includes(normalized);
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
      controls: controlsRef,
      demo: demoRef,
    };

    const target = map[key];
    if (target && target.current) {
      target.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
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
      <Sider style={{ height: '100%', boxShadow: token.boxShadow, background: token.colorBgContainer }}>
        <div>
          <Input.Search
            placeholder="Filter content"
            allowClear
            value={contentFilter}
            onChange={(e) => setContentFilter(e.target.value)}
            onSearch={(value) => setContentFilter(value)}
            style={{ backgroundColor: token.colorBgBase, width: '100%', padding: 6 }}
          />
        </div>
        <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 96px)' }}>
          <Menu
            mode="inline"
            selectable={false}
            onClick={handleMenuClick}
            items={menuItems}
            style={{ background: token.colorBgElevated, border: 0 }}
          />
        </div>
      </Sider>

      <Layout style={{ ...siderStyle, boxShadow: token.boxShadow }} >
        <Content style={{ overflow: 'hidden' }}>
          <Content ref={contentScrollRef} style={{ height: '100%', overflowY: 'auto' }}>
            {matchesContent('Fade Options', 'Escolha a direção do fade entre branco→preto ou preto→branco.') && (
              <Content ref={fadeRef} style={{ padding: 16, borderRadius: token.borderRadius, background: token.colorBgElevated || '#fbfbfb', boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.02)', marginBottom: 16 }}>
                <Title level={4}>Fade Options</Title>
                <Paragraph>Chose the direction to fade between white and black.</Paragraph>
                <Space direction="vertical">
                  <Select
                    value={(settings && settings.fadeDirection) ?? 0}
                    onChange={(value) => markUnsaved({ fadeDirection: value })}
                    style={{ width: 240 }}
                  >
                    <Select.Option value={0}>Fade to white</Select.Option>
                    <Select.Option value={1}>Fade to black</Select.Option>
                  </Select>
                </Space>
              </Content>
            )}
            {matchesContent('Controls', 'Preencha o formulário abaixo com os valores desejados para cada mapeamento.') && (
              <Content ref={controlsRef} style={{ padding: 16, borderRadius: token.borderRadius, background: token.colorBgElevated || '#ffffff', boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.02)', marginBottom: 16 }}>
                <Title level={4}>Controls</Title>
                <Paragraph>Setting of the values buttons to map controller of game.</Paragraph>
                <Content style={{ /*maxHeight: 420,*/ overflow: 'auto', paddingRight: 8 }}>
                    {/* only show configurable indices */}
                    {([8,0,10,11,2,3,4,5,6,7,27,28,29] as number[]).map((idx) => {
                      const entry = (controlsObj[0] && controlsObj[0][idx]) || { _values: [] };
                      const values: string[] = entry._values || [];
                      return (
                        <Content key={`control-${idx}`} style={{ padding: 8, borderRadius: token.borderRadius, background: token.colorFillTertiary || '#fff', marginBottom: 8 }}>
                        <Row gutter={12} align="middle">
                          <Col span={3}>
                            <Space>
                              {/* <strong>{idx}</strong> */}
                              <Space style={{ fontSize: 11, color: token.colorTextSecondary }}>{controlDescriptions[idx] || ''}</Space>
                            </Space>
                          </Col>
                          <Col span={14}>
                            <Input readOnly value={values.join(', ')} placeholder="(click to capture)" onClick={() => setCapturing({ player: 0, idx })} />
                          </Col>
                          <Col span={7}>
                            <Space>
                              <Button onClick={() => { setControlsAndUnsaved((prev:any) => { const next = {...prev}; if(!next[0]) next[0] = {}; next[0][idx] = { ...(next[0][idx]||{}), _values: [] }; return next; }); message.info('Cleared values'); }}>Clear</Button>
                            </Space>
                          </Col>
                        </Row>
                        </Content>
                      );
                    })}
                </Content>
                <Space style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <Button onClick={restoreDefaultControls}>Restore Defaults</Button>
                </Space>
              </Content>
            )}
            {matchesContent('Demo Filters', 'Demo configuration') && (
              <Content ref={demoRef} style={{ padding: 16, borderRadius: token.borderRadius, background: token.colorBgElevated || '#fbfbfb', boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.02)', marginBottom: 16 }}>
                <Title level={4}>Demo configuration</Title>
                <Paragraph>Configure the settings of display</Paragraph>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space style={{ width: '100%' }}>
                    <Content>Select filter: </Content>
                      <Select
                        style={{ width: 300 }}
                        value={(settings && settings.demoFilter) || demoFilterOptions[0].value}
                        onChange={(v) => markUnsaved({ demoFilter: v })}
                        options={demoFilterOptions.map(option => ({ value: option.value, label: option.label }))}
                      />
                    <Content style={{ paddingLeft: 10 }}>Show FPS: </Content>
                      <Switch checked={(settings && settings.demoShowFPS) || false} onChange={(v) => markUnsaved({ demoShowFPS: v })} />
                    <Content style={{ paddingLeft: 10 }}> Show Menu: </Content>
                      <Switch checked={(settings && settings.demoShowMenu) || false} onChange={(v) => markUnsaved({ demoShowMenu: v })} />
                    {/* <Content style={{ paddingLeft: 10 }}>Show Right Click to License: </Content>
                      <Switch checked={(settings && settings.demoShowLicense) || false} onChange={(v) => markUnsaved({ demoShowLicense: v })} /> */}
                  </Space>
                </Space>
              </Content>
            )}
          </Content>
        </Content>
      </Layout>
    </Layout>
  );
};

export default Settings;
