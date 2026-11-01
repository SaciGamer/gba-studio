import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const electronEntryPoint = path.join(repositoryRoot, 'dist', 'main', 'main.js');

async function launchApplication() {
  const electronApp = await electron.launch({
    args: [electronEntryPoint],
  });

  const splash = await electronApp.firstWindow();
  await expect(splash).toHaveURL(/#splash/);

  await expect
    .poll(() => electronApp.windows().map((page) => page.url()))
    .toContainEqual(expect.stringMatching(/#\/launcher/));

  const launcher = electronApp
    .windows()
    .find((page) => page.url().includes('#/launcher'));

  if (!launcher) {
    await electronApp.close();
    throw new Error('A janela do launcher não foi encontrada');
  }

  return { electronApp, launcher };
}

async function launchProjectApplication() {
  const electronApp = await electron.launch({
    args: [
      electronEntryPoint,
      path.join(
        repositoryRoot,
        'templateEngineGame',
        'sample_project_example',
        'sample_project.gbaproj',
      ),
    ],
  });

  await electronApp.firstWindow();
  await expect
    .poll(() => electronApp.windows().map((page) => page.url()))
    .toContainEqual(expect.stringMatching(/#engine/));

  const engine = electronApp
    .windows()
    .find((page) => page.url().includes('#engine'));

  if (!engine) {
    await electronApp.close();
    throw new Error('A janela do Engine não foi encontrada');
  }

  return { electronApp, engine };
}

async function clickAboutMenu(electronApp) {
  await electronApp.evaluate(({ Menu }) => {
    const applicationMenu = Menu.getApplicationMenu();
    const helpMenu = applicationMenu?.items.find((item) =>
      /help|ajuda/i.test(item.label),
    );
    const aboutItem = helpMenu?.submenu?.items.find((item) =>
      /about|sobre/i.test(item.label),
    );

    if (!aboutItem) {
      throw new Error('Item About não encontrado no menu da aplicação');
    }

    aboutItem.click();
  });
}

async function ensureLeftPanelVisible(engine) {
  await engine.evaluate(() => window.electronAPI.saveLastPositionSplitters([250, 800, 360]));
  await engine.reload();
  await expect(engine).toHaveURL(/#engine/);
  await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
  await expect(engine.getByTestId('left-panel')).toBeVisible();
}

test('mostra a posição de tile dentro do viewport do Game World', async () => {
  const { electronApp, engine } = await launchProjectApplication();
  try {
    await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
    const canvas = engine.locator('canvas[data-scene-id]').first();
    await expect(canvas).toBeVisible();
    const canvasBox = await canvas.boundingBox();
    await canvas.dispatchEvent('pointermove', { clientX: canvasBox.x + 8, clientY: canvasBox.y + 8 });
    const indicator = engine.getByTestId('scene-tile-position');
    await expect(indicator).toBeVisible();
    const [indicatorBox, viewportBox] = await Promise.all([indicator.boundingBox(), engine.locator('.react-transform-wrapper').first().boundingBox()]);
    expect(indicatorBox).not.toBeNull();
    expect(viewportBox).not.toBeNull();
    expect(indicatorBox.x).toBeGreaterThanOrEqual(viewportBox.x);
    expect(indicatorBox.x).toBeLessThanOrEqual(viewportBox.x + 24);
    expect(indicatorBox.y + indicatorBox.height).toBeLessThanOrEqual(viewportBox.y + viewportBox.height);
    expect(indicatorBox.width).toBeLessThanOrEqual(126);
    expect(indicatorBox.height).toBe(16);
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('mant\u00e9m o menu flutuante alinhado nos temas preto e novos', async () => {
  const { electronApp, engine } = await launchProjectApplication();

  try {
    await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
    const selectButton = engine.getByRole('button', { name: 'Select (v)', exact: true });
    await expect(selectButton).toBeVisible();

    for (const themeName of ['dark', 'glass', 'bootstrap', 'cartoon']) {
      await engine.evaluate((theme) => window.electronAPI.send('change-theme', theme), themeName);
      await expect(engine.locator(`[data-theme="${themeName}"]`)).toBeVisible();

      const geometry = await selectButton.evaluate((button) => {
        const icon = button.querySelector('.ant-btn-icon, .ant-float-btn-icon, .anticon');
        const buttonBox = button.getBoundingClientRect();
        const iconBox = icon?.getBoundingClientRect();

        return {
          width: buttonBox.width,
          height: buttonBox.height,
          offsetX: iconBox ? iconBox.left + iconBox.width / 2 - (buttonBox.left + buttonBox.width / 2) : null,
          offsetY: iconBox ? iconBox.top + iconBox.height / 2 - (buttonBox.top + buttonBox.height / 2) : null,
        };
      });

      expect(geometry.width, JSON.stringify(geometry)).toBe(50);
      expect(geometry.height, JSON.stringify(geometry)).toBe(themeName === 'dark' ? 58 : 50);
      expect(geometry.offsetX).not.toBeNull();
      expect(geometry.offsetY).not.toBeNull();
      expect(Math.abs(geometry.offsetX), JSON.stringify(geometry)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.offsetY), JSON.stringify(geometry)).toBeLessThanOrEqual(1);
    }
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('abre o launcher do GBA Studio', async () => {
  const { electronApp, launcher } = await launchApplication();

  try {
    await expect(launcher.getByText(/GBA Studio/).first()).toBeVisible();
  } finally {
    await electronApp.close();
  }
});

test('exibe o formulário de criação de projeto na aba New', async () => {
  const { electronApp, launcher } = await launchApplication();

  try {
    await launcher.getByText('New', { exact: true }).click();

    await expect(launcher.getByLabel('Project Name')).toBeVisible();
    await expect(launcher.getByText('Path', { exact: true })).toBeVisible();
    await expect(launcher.getByText('Blank Project', { exact: true })).toBeVisible();
    await expect(launcher.getByRole('button', { name: 'Create Project' })).toBeVisible();
  } finally {
    await electronApp.close();
  }
});

test('navega para a aba Recent', async () => {
  const { electronApp, launcher } = await launchApplication();

  try {
    await launcher.getByText('Recent', { exact: true }).click();

    await expect(launcher.getByText('Recent', { exact: true })).toBeVisible();
    await expect(launcher.getByLabel('Project Name')).toHaveCount(0);
  } finally {
    await electronApp.close();
  }
});

test('exibe os créditos da aplicação', async () => {
  const { electronApp, launcher } = await launchApplication();

  try {
    await launcher.getByText('Credits', { exact: true }).click();

    await expect(launcher.getByTestId('launcher-credits-roll')).toBeVisible();
    await expect(launcher.getByText('@SaciGamer-Dev', { exact: true }).first()).toBeVisible();
    await expect(launcher.locator('[data-credit-link="https://sacigamer.github.io/gba-studio-site/"]').first()).toBeVisible();
    await launcher.getByTestId('launcher-credits-roll').hover();
    await expect(launcher.locator('.launcher-credits-track')).toHaveCSS('animation-play-state', 'paused');
  } finally {
    await electronApp.close();
  }
});

test('abre a janela Engine com um projeto existente', async () => {
  const { electronApp, engine } = await launchProjectApplication();

  try {
    await expect(engine).toHaveURL(/#engine/);
    await expect(engine.locator('body')).toBeVisible();
  } finally {
    await electronApp.close();
  }
});

test('abre a janela About pelo menu nativo', async () => {
  const { electronApp, engine } = await launchProjectApplication();

  try {
    await clickAboutMenu(electronApp);

    await expect
      .poll(() => electronApp.windows().map((page) => page.url()))
      .toContainEqual(expect.stringMatching(/#about/));

    const about = electronApp
      .windows()
      .find((page) => page.url().includes('#about'));

    if (!about) {
      throw new Error('A janela About não foi encontrada');
    }

    await expect(about.getByText(/Engine Game Boy Advance/)).toBeVisible();
    await expect(about.getByText(/GPL-3.0 license/)).toBeVisible();
  } finally {
    await electronApp.close();
  }
});

test('exibe o monitoramento global de ROM e a VRAM da cena selecionada', async () => {
  const { electronApp, engine } = await launchProjectApplication();

  try {
    await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
    const monitor = engine.getByTestId('resource-usage-bars');
    await expect(monitor.getByText('ROM estimada', { exact: true })).toBeVisible();
    await expect(engine.getByTestId('scene-vram-usage')).toHaveCount(0);

    await engine.locator('.game-element').first().click();
    await expect(engine.getByTestId('scene-vram-usage')).toBeVisible();
    await expect(engine.getByTestId('scene-vram-usage').getByText('VRAM cena', { exact: true })).toBeVisible();
    const [vramBox, romBox] = await Promise.all([
      engine.getByTestId('scene-vram-usage').boundingBox(),
      monitor.getByText('ROM estimada', { exact: true }).locator('..').boundingBox(),
    ]);
    expect(vramBox.x).toBeLessThan(romBox.x);

    const viewportBox = await engine.locator('.react-transform-wrapper').boundingBox();
    const monitorBox = await monitor.boundingBox();
    expect(monitorBox.x).toBeGreaterThanOrEqual(viewportBox.x);
    expect(monitorBox.x + monitorBox.width).toBeLessThanOrEqual(viewportBox.x + viewportBox.width);
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('mantém o painel esquerdo ao maximizar e restaurar a janela', async () => {
  const { electronApp, engine } = await launchProjectApplication();

  const getLeftPanelWidth = async () => {
    const panel = engine.getByTestId('engine-layout-splitter').locator('.ant-splitter-panel').first();
    const box = await panel.boundingBox();
    if (!box) throw new Error('Painel esquerdo não encontrado');
    return box.width;
  };

  const shrinkLeftPanelToMinimum = async () => {
    const leftDivider = engine.getByTestId('engine-layout-splitter').locator('.ant-splitter-bar').first();
    const box = await leftDivider.boundingBox();
    if (!box) throw new Error('Divisor do painel esquerdo não encontrado');
    await engine.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await engine.mouse.down();
    await engine.mouse.move(box.x - 1_000, box.y + box.height / 2);
    await engine.mouse.up();
    await engine.waitForTimeout(200);
  };

  try {
    await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
    await ensureLeftPanelVisible(engine);

    await electronApp.evaluate(({ BrowserWindow }) => {
      const engineWindow = BrowserWindow.getAllWindows()
        .find(window => window.webContents.getURL().includes('#engine'));
      engineWindow?.maximize();
    });
    await engine.waitForTimeout(300);
    await shrinkLeftPanelToMinimum();
    const maximizedLeftWidth = await getLeftPanelWidth();
    expect(maximizedLeftWidth).toBeCloseTo(130, 0);

    await electronApp.evaluate(({ BrowserWindow }) => {
      const engineWindow = BrowserWindow.getAllWindows()
        .find(window => window.webContents.getURL().includes('#engine'));
      engineWindow?.unmaximize();
    });
    await engine.waitForTimeout(400);
    expect(await getLeftPanelWidth()).toBeCloseTo(maximizedLeftWidth, 0);
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('preserva o painel esquerdo ao mover o direito depois de restaurar a janela', async () => {
  const { electronApp, engine } = await launchProjectApplication();

  const getLeftPanelWidth = async () => {
    const panel = engine.getByTestId('engine-layout-splitter').locator('.ant-splitter-panel').first();
    const box = await panel.boundingBox();
    if (!box) throw new Error('Painel esquerdo não encontrado');
    return box.width;
  };

  try {
    await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
    await ensureLeftPanelVisible(engine);
    const initialLeftWidth = await getLeftPanelWidth();
    await electronApp.evaluate(({ BrowserWindow }) => {
      const engineWindow = BrowserWindow.getAllWindows()
        .find(window => window.webContents.getURL().includes('#engine'));
      engineWindow?.maximize();
    });
    await engine.waitForTimeout(300);

    await electronApp.evaluate(({ BrowserWindow }) => {
      const engineWindow = BrowserWindow.getAllWindows()
        .find(window => window.webContents.getURL().includes('#engine'));
      engineWindow?.unmaximize();
    });
    await engine.waitForTimeout(400);
    expect(await getLeftPanelWidth()).toBeCloseTo(initialLeftWidth, 0);

    const rightDivider = engine.getByTestId('engine-layout-splitter').locator('.ant-splitter-bar').last();
    const rightDividerBox = await rightDivider.boundingBox();
    if (!rightDividerBox) throw new Error('Divisor do painel direito não encontrado');
    await engine.mouse.move(rightDividerBox.x + rightDividerBox.width / 2, rightDividerBox.y + rightDividerBox.height / 2);
    await engine.mouse.down();
    await engine.mouse.move(Math.max(0, rightDividerBox.x - 120), rightDividerBox.y + rightDividerBox.height / 2);
    await engine.mouse.up();
    await engine.waitForTimeout(200);
    expect(await getLeftPanelWidth()).toBeCloseTo(initialLeftWidth, 0);
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('recolhe completamente o painel esquerdo e exibe o controle de restauração', async () => {
  const { electronApp, engine } = await launchProjectApplication();

  try {
    await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
    await ensureLeftPanelVisible(engine);
    const leftPanel = engine.getByTestId('left-panel');
    const leftDivider = leftPanel.locator('.ant-splitter-bar').first();
    const dividerBox = await leftDivider.boundingBox();
    if (!dividerBox) throw new Error('Divisor do painel esquerdo não encontrado');
    await engine.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + dividerBox.height / 2);
    await engine.mouse.down();
    await engine.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + 1_000);
    await engine.mouse.up();
    await expect(engine.getByLabel('Restore navigator panel')).toBeVisible();
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('mantém as seções do LeftPanel após maximizar e restaurar a janela', async () => {
  const { electronApp, engine } = await launchProjectApplication();

  try {
    await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
    await ensureLeftPanelVisible(engine);
    const leftPanel = engine.getByTestId('left-panel');
    await expect(leftPanel.getByText('SCENES', { exact: true })).toBeVisible();
    await expect(leftPanel.getByText('SCRIPTS', { exact: true })).toBeVisible();
    await expect(leftPanel.getByText('VARIABLES', { exact: true })).toBeVisible();

    await electronApp.evaluate(({ BrowserWindow }) => {
      const engineWindow = BrowserWindow.getAllWindows()
        .find(window => window.webContents.getURL().includes('#engine'));
      engineWindow?.maximize();
    });
    await engine.waitForTimeout(300);
    await electronApp.evaluate(({ BrowserWindow }) => {
      const engineWindow = BrowserWindow.getAllWindows()
        .find(window => window.webContents.getURL().includes('#engine'));
      engineWindow?.unmaximize();
    });
    await engine.waitForTimeout(400);
    await expect(leftPanel.getByText('SCENES', { exact: true })).toBeVisible();
    await expect(leftPanel.getByText('SCRIPTS', { exact: true })).toBeVisible();
    await expect(leftPanel.getByText('VARIABLES', { exact: true })).toBeVisible();
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('mantém o texto do menu selecionado visível', async () => {
  const { electronApp, launcher } = await launchApplication();

  try {
    await launcher.getByText('Recent', { exact: true }).click();
    const selectedLabel = launcher.locator('.ant-menu-item-selected').getByText('Recent', { exact: true });
    await expect(selectedLabel).toBeVisible();
    await expect(selectedLabel).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(launcher.locator('.ant-menu-item-selected .ant-menu-item-icon')).toHaveCSS('color', 'rgb(255, 255, 255)');
  } finally {
    await electronApp.close();
  }
});

test('abre a aba deslizante de tiles apenas para a cena selecionada', async () => {
  const { electronApp, engine } = await launchProjectApplication();

  try {
    await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
    const scene = engine.locator('.game-element').first();
    await expect(scene).toBeVisible();
    await expect(engine.locator('button[aria-label="Edit tiles"]')).toHaveCount(0);

    await scene.click();
    const pencil = engine.locator('button[aria-label="Edit tiles"]');
    await expect(pencil).toBeVisible();
    await expect(pencil).toHaveCSS('transform', /matrix/);

    await pencil.dispatchEvent('mouseover');
    await expect.poll(() => pencil.evaluate(button => getComputedStyle(button).transform)).not.toBe('none');
    await pencil.dispatchEvent('click');
    await expect(engine.locator('[aria-label="Tiles (l)"]')).toBeVisible();
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('seleciona a layer que será editada no modo de tiles', async () => {
  const { electronApp, engine } = await launchProjectApplication();

  try {
    await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
    await engine.locator('.game-element').first().click();
    const pencil = engine.locator('button[aria-label="Edit tiles"]');
    await pencil.dispatchEvent('mouseover');
    await pencil.dispatchEvent('click');

    const layerSelector = engine.locator('.ant-segmented').filter({ hasText: 'Layer 0' }).last();
    await expect(layerSelector).toBeVisible();
    await expect(layerSelector.getByText('Layer 0', { exact: true })).toBeVisible();
    await expect(layerSelector.getByText('Layer 1', { exact: true })).toBeVisible();
    await expect(layerSelector.getByText('Layer 2', { exact: true })).toBeVisible();
    await expect(layerSelector.getByText('Layer 3', { exact: true })).toBeVisible();
    await layerSelector.getByText('Layer 3', { exact: true }).click();
    await expect(layerSelector.locator('.ant-segmented-item-selected')).toHaveText('Layer 3');
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('cria uma trigger por arrasto e abre sua configuração', async () => {
  const { electronApp, engine } = await launchProjectApplication();

  try {
    await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
    const scene = engine.locator('.game-element').first();
    await scene.click();
    const pencil = engine.locator('button[aria-label="Edit tiles"]');
    await pencil.dispatchEvent('mouseover');
    await pencil.dispatchEvent('click');

    await engine.keyboard.press('t');

    const canvas = scene.locator('canvas[data-scene-id]');
    await expect(canvas).toHaveAttribute('data-edit-tool', 'add:Trigger');
    await expect(canvas).toHaveAttribute('data-tile-editing', 'true');
    await expect(canvas).toHaveAttribute('data-selected', 'true');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas da cena não encontrado');
    // Keep clear of the starting-player overlay in the scene's upper-left tile.
    expect(await engine.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, { x: box.x + 80, y: box.y + 80 })).toBe('CANVAS');
    await engine.mouse.move(box.x + 80, box.y + 80);
    await engine.mouse.down();
    await engine.mouse.move(box.x + 104, box.y + 96);
    await engine.mouse.up();

    await expect(scene.locator('span[title^="Trigger"]')).toHaveCount(1);
    await expect(canvas).toHaveAttribute('data-active-object', /.+/);
    await expect(engine.getByText('On Enter', { exact: true })).toBeVisible();
    await expect(engine.getByText('On Leave', { exact: true })).toBeVisible();
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('sai da edição de tiles ao clicar fora ou ativar Add Scene', async () => {
  const { electronApp, engine } = await launchProjectApplication();

  try {
    await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
    const scene = engine.locator('.game-element').first();
    await scene.click();
    const pencil = engine.locator('button[aria-label="Edit tiles"]');
    await pencil.dispatchEvent('mouseover');
    await pencil.click();
    const canvas = scene.locator('canvas[data-scene-id]');
    await expect(canvas).toHaveAttribute('data-tile-editing', 'true');

    await engine.keyboard.press('s');
    await expect(canvas).toHaveAttribute('data-tile-editing', 'false');
    await expect(engine.locator('button[aria-label="Edit tiles"]')).toHaveCount(0);

    const sceneCount = await engine.locator('.game-element').count();
    const addViewport = engine.locator('.react-transform-wrapper').first();
    const addViewportBox = await addViewport.boundingBox();
    if (!addViewportBox) throw new Error('Viewport do Game World não encontrado');
    await engine.mouse.move(addViewportBox.x + addViewportBox.width - 48, addViewportBox.y + addViewportBox.height - 48);
    await engine.mouse.click(addViewportBox.x + addViewportBox.width - 48, addViewportBox.y + addViewportBox.height - 48);
    await expect(engine.locator('.game-element')).toHaveCount(sceneCount + 1);
    await engine.keyboard.press('v');

    await scene.click();
    await pencil.dispatchEvent('mouseover');
    await pencil.click();
    await expect(canvas).toHaveAttribute('data-tile-editing', 'true');
    const viewport = engine.locator('.react-transform-wrapper').first();
    const viewportBox = await viewport.boundingBox();
    if (!viewportBox) throw new Error('Viewport do Game World não encontrado');
    await engine.mouse.click(viewportBox.x + viewportBox.width - 12, viewportBox.y + viewportBox.height - 12);
    await expect(canvas).toHaveAttribute('data-tile-editing', 'false');
    await expect(engine.locator('button[aria-label="Edit tiles"]')).toHaveCount(0);
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('botão Add Scene do painel Scenes encerra a edição', async () => {
  const { electronApp, engine } = await launchProjectApplication();

  try {
    await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
    await ensureLeftPanelVisible(engine);
    const leftPanel = engine.getByTestId('left-panel');
    const scene = engine.locator('.game-element').first();
    await scene.click();
    const pencil = engine.locator('button[aria-label="Edit tiles"]');
    await pencil.dispatchEvent('mouseover');
    await pencil.click();
    const canvas = scene.locator('canvas[data-scene-id]');
    await expect(canvas).toHaveAttribute('data-tile-editing', 'true');

    await leftPanel.getByRole('button', { name: 'Add Scene', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-tile-editing', 'false');
    await expect(engine.locator('button[aria-label="Edit tiles"]')).toHaveCount(0);
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('alterna a grade de tiles pelo atalho g', async () => {
  const { electronApp, engine } = await launchProjectApplication();

  try {
    await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
    const scene = engine.locator('.game-element').first();
    await scene.click();
    const pencil = engine.locator('button[aria-label="Edit tiles"]');
    await pencil.dispatchEvent('mouseover');
    await pencil.click();
    const canvas = scene.locator('canvas[data-scene-id]');
    await expect(canvas).toHaveAttribute('data-tile-grid', 'visible');
    await engine.keyboard.press('g');
    await expect(canvas).toHaveAttribute('data-tile-grid', 'hidden');
    await engine.keyboard.press('g');
    await expect(canvas).toHaveAttribute('data-tile-grid', 'visible');
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('restringe Logo à Layer 2 e ao modo Direct Bitmap', async () => {
  const { electronApp, engine } = await launchProjectApplication();

  try {
    await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
    await engine.locator('.game-element').first().click();
    await engine.locator('[title="Select scene type"]').first().click();
    await engine.getByText('Logo', { exact: true }).last().click();

    const backgroundTabs = engine.locator('.ant-tabs').filter({ hasText: 'Layer 2' }).first();
    await expect(backgroundTabs.getByText('Layer 2', { exact: true })).toBeVisible();
    await expect(backgroundTabs.getByText('Layer 0', { exact: true })).toHaveCount(0);

    const pencil = engine.locator('button[aria-label="Edit tiles"]');
    await pencil.dispatchEvent('mouseover');
    await pencil.click();
    const layerSelector = engine.locator('.ant-segmented').last();
    await expect(layerSelector.getByText('Layer 2', { exact: true })).toBeVisible();
    await expect(layerSelector.getByText('Layer 0', { exact: true })).toHaveCount(0);
    await expect(engine.getByText('Direct Bitmap BG', { exact: true })).toBeVisible();
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('insere um Actor e abre sua configuração', async () => {
  const { electronApp, engine } = await launchProjectApplication();

  try {
    await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
    const scene = engine.locator('.game-element').first();
    await scene.click();
    const pencil = engine.locator('button[aria-label="Edit tiles"]');
    await pencil.dispatchEvent('mouseover');
    await pencil.dispatchEvent('click');
    await engine.keyboard.press('a');

    const canvas = scene.locator('canvas[data-scene-id]');
    const actors = scene.locator('span[title^="Actor"]');
    const actorCount = await actors.count();
    await expect(canvas).toHaveAttribute('data-edit-tool', 'add:Actor');
    await expect(canvas).toHaveAttribute('data-selected', 'true');
    await expect(canvas).toHaveAttribute('data-tile-editing', 'true');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas da cena não encontrado');
    await canvas.dispatchEvent('pointerdown', {
      clientX: box.x + box.width / 2,
      clientY: box.y + box.height / 2,
      pointerId: 1,
    });
    await expect(actors).toHaveCount(actorCount + 1);
    const actor = actors.nth(actorCount);
    await expect(actor).toHaveCSS('width', '16px');
    await expect(actor).toHaveCSS('height', '8px');
    await expect(actor.locator('[aria-label$="sprite preview"]')).toHaveCount(1);
    await expect(actor.locator('[aria-label$="sprite preview"]')).toHaveCSS('width', '16px');
    const actorName = await actor.getAttribute('title');
    if (!actorName) throw new Error('Actor inserido sem nome');
    await expect(engine.getByRole('heading', { name: actorName, exact: true })).toBeVisible();
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('edita visualmente a cor 1 com o painel completo do ColorPicker', async () => {
  const { electronApp, engine } = await launchProjectApplication();

  try {
    await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
    await electronApp.evaluate(({ BrowserWindow }) => {
      const engineWindow = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().includes('#engine'),
      );
      engineWindow?.webContents.send('change-content-view', 7);
    });

    await expect(engine.getByText('PALETTES', { exact: true }).first()).toBeVisible();
    const colorOne = engine.getByRole('button', { name: 'Choose palette color 1', exact: true });
    await colorOne.click();

    const spectrum = engine.locator('.ant-color-picker-saturation');
    await expect(spectrum).toBeVisible();
    await expect.poll(async () => (await spectrum.boundingBox())?.height ?? 0).toBeGreaterThan(100);

    const hexInput = engine.locator('.ant-color-picker-hex-input input');
    await hexInput.fill('FF0000');
    await expect(colorOne.locator('span')).toHaveCSS('background-color', 'rgb(255, 0, 0)');
    await expect(engine.locator('.ant-color-picker-alpha-input')).toHaveCount(0);
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('abre o Sprite Editor com painéis redimensionáveis e controles de preview', async () => {
  const { electronApp, engine } = await launchProjectApplication();

  try {
    await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
    await electronApp.evaluate(({ BrowserWindow }) => {
      const engineWindow = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().includes('#engine'),
      );
      engineWindow?.webContents.send('change-content-view', 3);
    });

    await expect(engine.getByText('SPRITES', { exact: true })).toBeVisible();
    await expect(engine.getByText('ANIMATION STATES', { exact: true })).toBeVisible();
    await expect(engine.getByText('SPRITE SETTINGS', { exact: true })).toBeVisible();
    await expect(engine.getByText('ANIMATION SETTINGS', { exact: true })).toBeVisible();
    await expect(engine.getByText('TILES', { exact: true })).toBeVisible();
    await expect(engine.getByText('Min. 8×8', { exact: true })).toHaveCount(0);
    await expect(engine.getByText('Min. 8×16', { exact: true })).toHaveCount(0);
    await expect(engine.getByText('Default colors', { exact: true })).toHaveCount(0);
    await expect(engine.getByText('Frames / Direction', { exact: true })).toHaveCount(0);
    await expect(engine.getByRole('button', { name: 'Add Animation', exact: true })).toHaveCount(0);
    await expect.poll(() => engine.locator('.ant-splitter-bar').count()).toBeGreaterThanOrEqual(4);

    await engine.getByRole('button', { name: 'zoom-in' }).click();
    await expect(engine.getByText('400%', { exact: true })).toBeVisible();

  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});
