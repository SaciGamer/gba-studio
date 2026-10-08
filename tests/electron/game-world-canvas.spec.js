import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const electronEntryPoint = path.join(repositoryRoot, 'dist', 'main', 'main.js');
const sampleProject = path.join(
  repositoryRoot,
  'templateEngineGame',
  'sample_project_example',
  'sample_project.gbaproj',
);

async function launchSampleProject() {
  const electronApp = await electron.launch({
    args: [electronEntryPoint, sampleProject],
  });
  await electronApp.firstWindow();
  await expect
    .poll(() => electronApp.windows().map(page => page.url()))
    .toContainEqual(expect.stringMatching(/#engine/));
  const engine = electronApp.windows().find(page => page.url().includes('#engine'));
  if (!engine) {
    await electronApp.close();
    throw new Error('Game World window was not found');
  }
  await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
  return { electronApp, engine };
}

async function findBlankPanLane(viewport) {
  return viewport.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    for (let y = bounds.top + 24; y < bounds.bottom - 24; y += 16) {
      const leftX = bounds.left + 24;
      const rightX = bounds.right - 24;
      const leftTarget = document.elementFromPoint(leftX, y);
      const rightTarget = document.elementFromPoint(rightX, y);
      const isBlankViewportPoint = (target) => target
        && element.contains(target)
        && !target.closest('.game-element')
        && !target.closest('.ant-float-btn-group');
      if (isBlankViewportPoint(leftTarget) && isBlankViewportPoint(rightTarget)) {
        return { left: { x: leftX, y }, right: { x: rightX, y } };
      }
    }
    return null;
  });
}

test('the infinite Game World grid follows zoom and pan without scrollbars', async () => {
  const { electronApp, engine } = await launchSampleProject();
  try {
    await engine.bringToFront();
    const viewport = engine.getByTestId('game-world-viewport');
    const grid = engine.getByTestId('game-world-grid');
    const navigatorButton = engine.getByRole('button', { name: 'Select (v)' });
    const positionHud = engine.getByTestId('scene-tile-position');
    const resourceHud = engine.getByTestId('resource-usage-bars');
    await expect(viewport).toBeVisible();
    await expect(grid).toBeVisible();
    await expect(navigatorButton).toBeVisible();
    await expect(positionHud).toContainText(/\d+%.*Snap 16/);
    await expect(resourceHud).toBeVisible();
    const overlayPositions = await Promise.all([navigatorButton, positionHud, resourceHud].map(locator => locator.boundingBox()));

    const initial = await grid.evaluate(element => ({
      size: getComputedStyle(element).backgroundSize,
      position: getComputedStyle(element).backgroundPosition,
      overflow: getComputedStyle(element.parentElement).overflow,
    }));
    expect(initial.overflow).toBe('hidden');

    const viewportBounds = await viewport.boundingBox();
    expect(viewportBounds).not.toBeNull();
    const centerX = viewportBounds.x + viewportBounds.width / 2;
    const centerY = viewportBounds.y + viewportBounds.height / 2;

    await engine.mouse.move(centerX, centerY);
    await engine.keyboard.down('Control');
    await engine.mouse.wheel(0, -240);
    await engine.keyboard.up('Control');

    await expect.poll(() => grid.evaluate(element => getComputedStyle(element).backgroundSize))
      .not.toBe(initial.size);

    const positionAfterZoom = await grid.evaluate(element => getComputedStyle(element).backgroundPosition);
    const panLane = await findBlankPanLane(viewport);
    expect(panLane).not.toBeNull();
    await engine.mouse.move(panLane.left.x, panLane.left.y);
    await expect(positionHud).toContainText(/World X: -?\d+, Y: -?\d+/);
    await engine.mouse.move(panLane.right.x, panLane.right.y);
    await engine.mouse.down({ button: 'middle' });
    await engine.mouse.move(panLane.left.x + 43, panLane.left.y + 31, { steps: 3 });
    await engine.mouse.up({ button: 'middle' });

    await expect.poll(() => grid.evaluate(element => getComputedStyle(element).backgroundPosition))
      .not.toBe(positionAfterZoom);
    const overlayPositionsAfterPan = await Promise.all([navigatorButton, positionHud, resourceHud].map(locator => locator.boundingBox()));
    for (const [index, position] of overlayPositions.entries()) {
      expect(position).not.toBeNull();
      expect(overlayPositionsAfterPan[index]).not.toBeNull();
      expect(Math.abs(overlayPositionsAfterPan[index].x - position.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(overlayPositionsAfterPan[index].y - position.y)).toBeLessThanOrEqual(1);
    }

    const content = viewport.locator('.react-transform-component').first();
    const contentWidth = await content.evaluate(element => parseFloat(getComputedStyle(element).width));
    const contentHeight = await content.evaluate(element => parseFloat(getComputedStyle(element).height));
    const cameraXBeforeExtendedPan = Number(await viewport.getAttribute('data-world-x'));
    const scaleBeforeExtendedPan = Number(await viewport.getAttribute('data-world-scale'));
    for (let index = 0; index < 8; index += 1) {
      const lane = await findBlankPanLane(viewport);
      expect(lane).not.toBeNull();
      await engine.mouse.move(lane.right.x, lane.right.y);
      await engine.mouse.down({ button: 'middle' });
      await engine.mouse.move(lane.left.x, lane.left.y, { steps: 5 });
      await engine.mouse.up({ button: 'middle' });
    }
    const cameraXAfterExtendedPan = Number(await viewport.getAttribute('data-world-x'));
    expect(cameraXAfterExtendedPan).toBeLessThan(cameraXBeforeExtendedPan - contentWidth * scaleBeforeExtendedPan - viewportBounds.width);

    const cameraYBeforeExtendedPan = Number(await viewport.getAttribute('data-world-y'));
    for (let index = 0; index < 8; index += 1) {
      const lane = await viewport.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const isBlank = (target) => target
          && element.contains(target)
          && !target.closest('.game-element')
          && !target.closest('.ant-float-btn-group')
          && !target.closest('[data-testid="resource-usage-bars"]')
          && !target.closest('[data-testid="scene-tile-position"]');
        for (let x = bounds.left + 80; x < bounds.right - 80; x += 16) {
          const start = { x, y: bounds.top + 48 };
          const end = { x, y: bounds.bottom - 100 };
          if (isBlank(document.elementFromPoint(start.x, start.y)) && isBlank(document.elementFromPoint(end.x, end.y))) return { start, end };
        }
        return null;
      });
      expect(lane).not.toBeNull();
      await engine.mouse.move(lane.start.x, lane.start.y);
      await engine.mouse.down({ button: 'middle' });
      await engine.mouse.move(lane.end.x, lane.end.y, { steps: 5 });
      await engine.mouse.up({ button: 'middle' });
    }
    const cameraYAfterExtendedPan = Number(await viewport.getAttribute('data-world-y'));
    expect(cameraYAfterExtendedPan).toBeGreaterThan(cameraYBeforeExtendedPan + contentHeight * scaleBeforeExtendedPan + viewportBounds.height);

    const documentScroll = await engine.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      height: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    }));
    expect(documentScroll.width).toBe(documentScroll.clientWidth);
    expect(documentScroll.height).toBe(documentScroll.clientHeight);
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('adding a scene after panning expands the world and snaps it to 16 px', async () => {
  const { electronApp, engine } = await launchSampleProject();
  try {
    const viewport = engine.getByTestId('game-world-viewport');
    const grid = engine.getByTestId('game-world-grid');
    const content = viewport.locator('.react-transform-component').first();
    const initialContentWidth = await content.evaluate(element => parseFloat(getComputedStyle(element).width));
    const viewportBounds = await viewport.boundingBox();
    expect(viewportBounds).not.toBeNull();
    const initialGridBounds = await grid.boundingBox();
    expect(initialGridBounds.width).toBeCloseTo(viewportBounds.width, 0);
    expect(initialGridBounds.height).toBeCloseTo(viewportBounds.height, 0);
    const panLane = await findBlankPanLane(viewport);
    expect(panLane).not.toBeNull();

    // Pan until the pointer maps beyond the current world's right edge.
    let worldPointerX = 0;
    for (let index = 0; index < 10; index += 1) {
      const camera = await viewport.evaluate(element => ({
        x: Number(element.dataset.worldX),
        scale: Number(element.dataset.worldScale),
      }));
      worldPointerX = (panLane.right.x - viewportBounds.x - camera.x) / camera.scale;
      if (worldPointerX > initialContentWidth - 732) break;
      await engine.mouse.move(panLane.right.x, panLane.right.y);
      await engine.mouse.down({ button: 'middle' });
      await engine.mouse.move(panLane.left.x, panLane.left.y, { steps: 5 });
      await engine.mouse.up({ button: 'middle' });
    }
    const finalCamera = await viewport.evaluate(element => ({
      x: Number(element.dataset.worldX),
      scale: Number(element.dataset.worldScale),
    }));
    worldPointerX = (panLane.right.x - viewportBounds.x - finalCamera.x) / finalCamera.scale;
    expect(worldPointerX).toBeGreaterThan(initialContentWidth - 732);

    await engine.keyboard.press('s');
    const placementPoint = await viewport.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      for (let y = bounds.top + 30; y < bounds.bottom - 30; y += 24) {
        for (let x = bounds.right - 30; x > bounds.left + 30; x -= 24) {
          const target = document.elementFromPoint(x, y);
          if (target && element.contains(target) && !target.closest('.game-element')) return { x, y };
        }
      }
      return null;
    });
    expect(placementPoint).not.toBeNull();

    const previousSceneCount = await engine.locator('.game-element').count();
    await engine.mouse.move(placementPoint.x, placementPoint.y);
    await engine.mouse.click(placementPoint.x, placementPoint.y);

    const scenes = engine.locator('.game-element');
    await expect(scenes).toHaveCount(previousSceneCount + 1);
    const createdScene = scenes.nth(previousSceneCount);
    await expect.poll(() => content.evaluate(element => parseFloat(getComputedStyle(element).width)))
      .toBeGreaterThan(initialContentWidth);
    await expect(grid).toBeVisible();
    expect(await grid.evaluate(element => getComputedStyle(element).backgroundImage)).not.toBe('none');

    const position = await createdScene.evaluate(element => ({
      left: parseFloat(element.style.left),
      top: parseFloat(element.style.top),
    }));
    expect(Math.abs((position.left - 106) % 16)).toBe(0);
    expect(Math.abs((position.top - 82) % 16)).toBe(0);
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('dragging scenes keeps 16 px world snapping at zoom out, baseline, and zoom in', async () => {
  const { electronApp, engine } = await launchSampleProject();
  const originalPreferences = await engine.evaluate(() => window.electronAPI.loadPreferences());
  const viewport = engine.getByTestId('game-world-viewport');
  try {
    await expect(viewport).toHaveAttribute('data-scene-movement-mode', originalPreferences?.gameWorldMovementMode === 'free' ? 'free' : 'grid');
    await engine.evaluate(async values => {
      const preferences = { panInertia: values?.gameWorldPanInertia !== false, movementMode: 'grid' };
      await window.electronAPI.setGameWorldPreferences(preferences);
      window.dispatchEvent(new CustomEvent('gba-studio:game-world-preferences', {
        detail: { gameWorldPanInertia: preferences.panInertia, gameWorldMovementMode: 'grid' },
      }));
    }, originalPreferences);
    await expect(viewport).toHaveAttribute('data-scene-movement-mode', 'grid');
    await engine.bringToFront();
    const scenes = engine.locator('.game-element');
    await expect(scenes.first()).toBeVisible();
    const cameraScale = () => viewport.evaluate(element => {
      const transform = getComputedStyle(element.querySelector('.react-transform-component')).transform;
      const matrix = new DOMMatrixReadOnly(transform);
      return Math.hypot(matrix.a, matrix.b);
    });

    const visibleScene = async () => {
      for (let index = 0; index < await scenes.count(); index += 1) {
        const scene = scenes.nth(index);
        const bounds = await scene.getByTestId('game-element-drag-handle').boundingBox();
        if (bounds && bounds.width > 16 && bounds.height > 16) {
          const viewportBounds = await viewport.boundingBox();
          if (viewportBounds
            && bounds.x + bounds.width > viewportBounds.x
            && bounds.y + bounds.height > viewportBounds.y
            && bounds.x < viewportBounds.x + viewportBounds.width
            && bounds.y < viewportBounds.y + viewportBounds.height) return scene;
        }
      }
      throw new Error('No scene intersects the Game World viewport');
    };

    const dragAndCheckSnap = async (label) => {
      const scene = await visibleScene();
      const dragHandle = scene.getByTestId('game-element-drag-handle');
      const bounds = await dragHandle.boundingBox();
      expect(bounds).not.toBeNull();
      const before = await scene.evaluate(element => ({
        left: parseFloat(element.style.left),
        top: parseFloat(element.style.top),
      }));
      const viewportBounds = await viewport.boundingBox();
      const visibleLeft = Math.max(bounds.x, viewportBounds.x);
      const visibleRight = Math.min(bounds.x + bounds.width, viewportBounds.x + viewportBounds.width);
      const visibleTop = Math.max(bounds.y, viewportBounds.y);
      const visibleBottom = Math.min(bounds.y + bounds.height, viewportBounds.y + viewportBounds.height);
      const scale = await cameraScale();
      expect(scale).toBeGreaterThan(0);
      expect(visibleRight).toBeGreaterThan(visibleLeft);
      expect(visibleBottom).toBeGreaterThan(visibleTop);
      const startX = visibleLeft + (visibleRight - visibleLeft) / 2;
      const startY = visibleTop + (visibleBottom - visibleTop) / 2;
      const deltaX = 53;
      const deltaY = 37;
      await engine.mouse.move(startX, startY);
      await engine.mouse.down({ button: 'left' });
      await engine.mouse.move(startX + deltaX, startY + deltaY, { steps: 5 });
      await engine.mouse.up();

      await expect.poll(() => scene.evaluate(element => ({
        left: parseFloat(element.style.left),
        top: parseFloat(element.style.top),
      })), { message: `scene should move at ${label}` }).not.toEqual(before);
      const after = await scene.evaluate(element => ({
        left: parseFloat(element.style.left),
        top: parseFloat(element.style.top),
      }));
      const expectedX = Math.round(deltaX / scale / 16) * 16;
      const expectedY = Math.round(deltaY / scale / 16) * 16;
      expect(after.left - before.left, `world X movement at ${label}`).toBe(expectedX);
      expect(after.top - before.top, `world Y movement at ${label}`).toBe(expectedY);
    };

    const changeZoom = async (direction) => {
      await engine.getByRole('button', { name: direction === 'out' ? '-' : '+', exact: true }).click();
      const zoomLabel = engine.getByRole('button', { name: /^\d+%$/ });
      const zoomPercent = Number((await zoomLabel.innerText()).replace('%', ''));
      await expect.poll(cameraScale)
        .toBeCloseTo(zoomPercent / 100, 2);
    };

    const baselineScale = await cameraScale();
    await changeZoom('out');
    await expect.poll(cameraScale)
      .toBeLessThan(baselineScale);
    const zoomOutScale = await cameraScale();
    await dragAndCheckSnap('zoom out');

    await changeZoom('in');
    await expect.poll(cameraScale)
      .toBeCloseTo(baselineScale, 2);
    await dragAndCheckSnap('baseline zoom');

    await changeZoom('in');
    await expect.poll(cameraScale)
      .toBeGreaterThan(baselineScale);
    const zoomInScale = await cameraScale();
    expect(zoomOutScale).toBeLessThan(baselineScale);
    expect(zoomInScale).toBeGreaterThan(baselineScale);
    await dragAndCheckSnap('zoom in');
  } finally {
    await engine.evaluate(async values => {
      const preferences = {
        panInertia: values?.gameWorldPanInertia !== false,
        movementMode: values?.gameWorldMovementMode === 'free' ? 'free' : 'grid',
      };
      await window.electronAPI.setGameWorldPreferences(preferences);
      window.dispatchEvent(new CustomEvent('gba-studio:game-world-preferences', {
        detail: { gameWorldPanInertia: preferences.panInertia, gameWorldMovementMode: preferences.movementMode },
      }));
    }, originalPreferences);
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('dragging an unselected scene previews only that scene in the canvas and minimap', async () => {
  const { electronApp, engine } = await launchSampleProject();
  try {
    const viewport = engine.getByTestId('game-world-viewport');
    await engine.getByTestId('game-world-recenter').click();
    const scenes = engine.locator('.game-element');
    const viewportBounds = await viewport.boundingBox();
    const visibleScenes = [];
    for (let index = 0; index < await scenes.count(); index += 1) {
      const scene = scenes.nth(index);
      const handle = scene.getByTestId('game-element-drag-handle');
      const bounds = await handle.boundingBox();
      if (bounds && viewportBounds
        && bounds.x + bounds.width > viewportBounds.x
        && bounds.y + bounds.height > viewportBounds.y
        && bounds.x < viewportBounds.x + viewportBounds.width
        && bounds.y < viewportBounds.y + viewportBounds.height) visibleScenes.push({ scene, handle });
      if (visibleScenes.length === 2) break;
    }
    expect(visibleScenes.length).toBe(2);
    const [selected, dragged] = visibleScenes;
    const minimapSceneId = await dragged.scene.evaluate(element => element.id);
    const selectedMinimapSceneId = await selected.scene.evaluate(element => element.id);
    const draggedMinimapScene = engine.getByTestId(`game-world-minimap-scene-${minimapSceneId}`);
    const selectedMinimapScene = engine.getByTestId(`game-world-minimap-scene-${selectedMinimapSceneId}`);
    const selectedCanvas = selected.scene.locator('canvas').first();
    const draggedCanvas = dragged.scene.locator('canvas').first();
    await selectedCanvas.click();
    await expect(selectedCanvas).toHaveAttribute('data-selected', 'true');
    await expect(draggedCanvas).toHaveAttribute('data-selected', 'false');

    const selectedBefore = await selected.scene.evaluate(element => ({
      left: element.style.left,
      top: element.style.top,
      transform: getComputedStyle(element).transform,
    }));
    const draggedPositionBefore = await dragged.scene.evaluate(element => ({ left: element.style.left, top: element.style.top }));
    const draggedMinimapPositionBefore = {
      x: Number(await draggedMinimapScene.getAttribute('x')),
      y: Number(await draggedMinimapScene.getAttribute('y')),
    };
    const selectedMinimapPositionBefore = {
      x: Number(await selectedMinimapScene.getAttribute('x')),
      y: Number(await selectedMinimapScene.getAttribute('y')),
    };
    const draggedBefore = await dragged.handle.boundingBox();
    const viewportRight = viewportBounds.x + viewportBounds.width;
    const viewportBottom = viewportBounds.y + viewportBounds.height;
    const visibleLeft = Math.max(draggedBefore.x, viewportBounds.x);
    const visibleRight = Math.min(draggedBefore.x + draggedBefore.width, viewportRight);
    const visibleTop = Math.max(draggedBefore.y, viewportBounds.y);
    const visibleBottom = Math.min(draggedBefore.y + draggedBefore.height, viewportBottom);
    const startX = visibleLeft + (visibleRight - visibleLeft) / 2;
    const startY = visibleTop + (visibleBottom - visibleTop) / 2;
    await engine.mouse.move(startX, startY);
    await engine.mouse.down();
    await engine.mouse.move(startX + 47, startY + 35, { steps: 4 });
    const selectedDuringDrag = await selected.scene.evaluate(element => ({
      left: element.style.left,
      top: element.style.top,
      transform: getComputedStyle(element).transform,
    }));
    expect(selectedDuringDrag).toEqual(selectedBefore);
    const draggedDuring = await dragged.handle.boundingBox();
    expect(Math.abs(draggedDuring.x - draggedBefore.x) + Math.abs(draggedDuring.y - draggedBefore.y)).toBeGreaterThan(16);
    await expect.poll(async () => ({
      x: Number(await draggedMinimapScene.getAttribute('x')),
      y: Number(await draggedMinimapScene.getAttribute('y')),
    })).not.toEqual(draggedMinimapPositionBefore);
    expect({
      x: Number(await selectedMinimapScene.getAttribute('x')),
      y: Number(await selectedMinimapScene.getAttribute('y')),
    }).toEqual(selectedMinimapPositionBefore);
    await engine.mouse.up();
    await expect.poll(() => dragged.scene.evaluate(element => ({ left: element.style.left, top: element.style.top })))
      .not.toEqual(draggedPositionBefore);
    expect(await selected.scene.evaluate(element => ({ left: element.style.left, top: element.style.top })))
      .toEqual({ left: selectedBefore.left, top: selectedBefore.top });
    expect({
      x: Number(await draggedMinimapScene.getAttribute('x')),
      y: Number(await draggedMinimapScene.getAttribute('y')),
    }).toEqual({
      x: parseFloat(await dragged.scene.evaluate(element => element.style.left)),
      y: parseFloat(await dragged.scene.evaluate(element => element.style.top)),
    });
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('group selection moves all minimap scenes and dims secondary selections', async () => {
  const { electronApp, engine } = await launchSampleProject();
  try {
    await engine.getByTestId('game-world-recenter').click();
    const viewport = engine.getByTestId('game-world-viewport');
    const viewportBounds = await viewport.boundingBox();
    const scenes = engine.locator('.game-element');
    const visibleScenes = [];
    for (let index = 0; index < await scenes.count(); index += 1) {
      const scene = scenes.nth(index);
      const handle = scene.getByTestId('game-element-drag-handle');
      const bounds = await handle.boundingBox();
      if (bounds && viewportBounds
        && bounds.x + bounds.width > viewportBounds.x
        && bounds.y + bounds.height > viewportBounds.y
        && bounds.x < viewportBounds.x + viewportBounds.width
        && bounds.y < viewportBounds.y + viewportBounds.height) visibleScenes.push({ scene, handle });
      if (visibleScenes.length === 2) break;
    }
    expect(visibleScenes.length).toBe(2);
    const [secondary, primary] = visibleScenes;
    const secondaryCanvas = secondary.scene.locator('canvas').first();
    const primaryCanvas = primary.scene.locator('canvas').first();
    await secondaryCanvas.click();
    await primaryCanvas.click({ modifiers: ['Shift'] });
    const secondaryId = await secondary.scene.evaluate(element => element.id);
    const primaryId = await primary.scene.evaluate(element => element.id);
    const secondaryMapRect = engine.getByTestId(`game-world-minimap-scene-${secondaryId}`);
    const primaryMapRect = engine.getByTestId(`game-world-minimap-scene-${primaryId}`);
    await expect(primaryMapRect).toHaveAttribute('data-selection', 'primary');
    await expect(secondaryMapRect).toHaveAttribute('data-selection', 'secondary');
    expect(Number(await secondaryMapRect.getAttribute('fill-opacity')))
      .toBeLessThan(Number(await primaryMapRect.getAttribute('fill-opacity')));

    const secondaryBefore = {
      x: Number(await secondaryMapRect.getAttribute('x')),
      y: Number(await secondaryMapRect.getAttribute('y')),
    };
    const primaryBefore = {
      x: Number(await primaryMapRect.getAttribute('x')),
      y: Number(await primaryMapRect.getAttribute('y')),
    };
    const handleBounds = await primary.handle.boundingBox();
    const startX = Math.max(handleBounds.x, viewportBounds.x) + Math.min(handleBounds.width / 2, 20);
    const startY = Math.max(handleBounds.y, viewportBounds.y) + Math.min(handleBounds.height / 2, 15);
    await engine.mouse.move(startX, startY);
    await engine.mouse.down();
    await engine.mouse.move(startX + 48, startY + 32, { steps: 4 });
    await expect.poll(async () => Number(await secondaryMapRect.getAttribute('x')))
      .not.toBe(secondaryBefore.x);
    await expect.poll(async () => Number(await primaryMapRect.getAttribute('x')))
      .not.toBe(primaryBefore.x);
    await engine.mouse.up();
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('dragging a scene can move it into negative world coordinates', async () => {
  const { electronApp, engine } = await launchSampleProject();
  try {
    await engine.getByTestId('game-world-recenter').click();
    const viewport = engine.getByTestId('game-world-viewport');
    const viewportBounds = await viewport.boundingBox();
    const scenes = engine.locator('.game-element');
    const candidates = [];
    for (let index = 0; index < await scenes.count(); index += 1) {
      const scene = scenes.nth(index);
      const position = await scene.evaluate(element => ({
        x: parseFloat(element.style.left),
        y: parseFloat(element.style.top),
      }));
      const handle = scene.getByTestId('game-element-drag-handle');
      const bounds = await handle.boundingBox();
      if (bounds && viewportBounds
        && bounds.x + bounds.width > viewportBounds.x
        && bounds.y + bounds.height > viewportBounds.y
        && bounds.x < viewportBounds.x + viewportBounds.width
        && bounds.y < viewportBounds.y + viewportBounds.height) {
        candidates.push({ scene, handle, bounds, position });
      }
    }
    const target = candidates.sort((left, right) => left.position.x - right.position.x)[0];
    expect(target).not.toBeNull();
    const startX = Math.max(target.bounds.x, viewportBounds.x) + Math.min(20, target.bounds.width / 2);
    const startY = Math.max(target.bounds.y, viewportBounds.y) + Math.min(15, target.bounds.height / 2);
    const endX = viewportBounds.x + 2;
    await engine.mouse.move(startX, startY);
    await engine.mouse.down();
    await engine.mouse.move(endX, startY, { steps: 5 });
    await engine.mouse.up();
    await expect.poll(() => target.scene.evaluate(element => parseFloat(element.style.left)))
      .toBeLessThan(0);
    const finalX = await target.scene.evaluate(element => parseFloat(element.style.left));
    expect(Number.isFinite(finalX)).toBe(true);
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('minimap bounds expand while a scene is dragged outside the current view', async () => {
  const { electronApp, engine } = await launchSampleProject();
  try {
    await engine.getByTestId('game-world-recenter').click();
    const viewport = engine.getByTestId('game-world-viewport');
    const miniMap = engine.getByTestId('game-world-minimap');
    const viewportBounds = await viewport.boundingBox();
    const currentMaxX = await miniMap.evaluate(svg => {
      const bounds = svg.viewBox.baseVal;
      return bounds.x + bounds.width;
    });
    const scenes = engine.locator('.game-element');
    const candidates = [];
    for (let index = 0; index < await scenes.count(); index += 1) {
      const scene = scenes.nth(index);
      const handle = scene.getByTestId('game-element-drag-handle');
      const bounds = await handle.boundingBox();
      if (!bounds || !viewportBounds) continue;
      const visibleLeft = Math.max(bounds.x, viewportBounds.x);
      const visibleRight = Math.min(bounds.x + bounds.width, viewportBounds.x + viewportBounds.width);
      const visibleTop = Math.max(bounds.y, viewportBounds.y);
      const visibleBottom = Math.min(bounds.y + bounds.height, viewportBounds.y + viewportBounds.height);
      if (visibleRight - visibleLeft < 60 || visibleBottom <= visibleTop) continue;
      const worldX = await scene.evaluate(element => parseFloat(element.style.left));
      candidates.push({ scene, handle, bounds, visibleLeft, visibleRight, visibleTop, visibleBottom, worldX });
    }
    candidates.sort((left, right) => right.worldX - left.worldX);
    const target = candidates[0];
    expect(target).toBeTruthy();
    const sceneId = await target.scene.evaluate(element => element.id);
    const miniMapScene = engine.getByTestId(`game-world-minimap-scene-${sceneId}`);
    const startX = target.visibleLeft + (target.visibleRight - target.visibleLeft) / 2;
    const startY = target.visibleTop + (target.visibleBottom - target.visibleTop) / 2;
    const windowWidth = await engine.evaluate(() => window.innerWidth);
    const endX = Math.min(windowWidth - 8, viewportBounds.x + viewportBounds.width + 64);
    expect(endX - startX).toBeGreaterThan(40);
    await engine.mouse.move(startX, startY);
    await engine.mouse.down();
    await engine.mouse.move(endX, startY, { steps: 8 });
    await expect.poll(() => miniMap.evaluate(svg => {
      const bounds = svg.viewBox.baseVal;
      return bounds.x + bounds.width;
    })).toBeGreaterThan(currentMaxX + 1);
    const previewPosition = {
      x: Number(await miniMapScene.getAttribute('x')),
      y: Number(await miniMapScene.getAttribute('y')),
    };
    const previewBounds = await target.scene.boundingBox();
    await engine.mouse.up();

    const committedPosition = await target.scene.evaluate(element => ({
      x: parseFloat(element.style.left),
      y: parseFloat(element.style.top),
    }));
    expect(committedPosition).toEqual(previewPosition);
    await expect(target.scene).toHaveCSS('transform', 'none');
    const boundsAfterDrop = await target.scene.boundingBox();
    expect(Math.abs(boundsAfterDrop.x - previewBounds.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(boundsAfterDrop.y - previewBounds.y)).toBeLessThanOrEqual(1);
    expect({
      x: Number(await miniMapScene.getAttribute('x')),
      y: Number(await miniMapScene.getAttribute('y')),
    }).toEqual(committedPosition);
    await engine.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const settledBounds = await target.scene.boundingBox();
    expect(Math.abs(settledBounds.x - previewBounds.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(settledBounds.y - previewBounds.y)).toBeLessThanOrEqual(1);
    const targetBounds = await target.scene.boundingBox();
    const viewportAfterDrop = await engine.getByTestId('game-world-viewport').boundingBox();
    const clickX = Math.max(targetBounds.x, viewportAfterDrop.x)
      + (Math.min(targetBounds.x + targetBounds.width, viewportAfterDrop.x + viewportAfterDrop.width) - Math.max(targetBounds.x, viewportAfterDrop.x)) / 2;
    const clickY = Math.max(targetBounds.y, viewportAfterDrop.y)
      + (Math.min(targetBounds.y + targetBounds.height, viewportAfterDrop.y + viewportAfterDrop.height) - Math.max(targetBounds.y, viewportAfterDrop.y)) / 2;
    await engine.mouse.click(clickX, clickY);
    const boundsAfterClick = await target.scene.boundingBox();
    expect(Math.abs(boundsAfterClick.x - settledBounds.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(boundsAfterClick.y - settledBounds.y)).toBeLessThanOrEqual(1);

    await engine.getByTestId('game-world-recenter').click();
    const nextHandleBounds = await target.handle.boundingBox();
    const nextStartX = nextHandleBounds.x + Math.min(nextHandleBounds.width / 2, 20);
    const nextStartY = nextHandleBounds.y + Math.min(nextHandleBounds.height / 2, 15);
    await engine.mouse.move(nextStartX, nextStartY);
    await engine.mouse.down();
    await engine.mouse.move(nextStartX + 40, nextStartY + 24, { steps: 4 });
    const secondPreviewBounds = await target.scene.boundingBox();
    await engine.mouse.up();
    const secondDropBounds = await target.scene.boundingBox();
    expect(Math.abs(secondDropBounds.x - secondPreviewBounds.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(secondDropBounds.y - secondPreviewBounds.y)).toBeLessThanOrEqual(1);
    await expect.poll(async () => ({
      x: Number(await miniMapScene.getAttribute('x')),
      y: Number(await miniMapScene.getAttribute('y')),
    })).toEqual(await target.scene.evaluate(element => ({
      x: parseFloat(element.style.left),
      y: parseFloat(element.style.top),
    })));
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('the minimap navigates the infinite world and recenters all scenes above the ROM indicator', async () => {
  const { electronApp, engine } = await launchSampleProject();
  try {
    const viewport = engine.getByTestId('game-world-viewport');
    const panel = engine.getByTestId('game-world-minimap-panel');
    const miniMap = engine.getByTestId('game-world-minimap');
    const viewRect = engine.getByTestId('game-world-minimap-viewport');
    const recenter = engine.getByTestId('game-world-recenter');
    const resources = engine.getByTestId('resource-usage-bars');
    await expect(panel).toBeVisible();
    await expect(miniMap).toBeVisible();
    await expect(viewRect).toBeVisible();
    await expect(viewRect).toHaveAttribute('stroke-width', '1.25');
    await expect(recenter).toBeVisible();
    const sceneCount = await engine.locator('.game-element').count();
    expect(await miniMap.locator('rect').count()).toBe(sceneCount + 1);

    const panelBounds = await panel.boundingBox();
    const resourceBounds = await resources.boundingBox();
    expect(panelBounds.y + panelBounds.height).toBeLessThan(resourceBounds.y);

    const cameraBefore = await viewport.evaluate(element => ({
      x: element.dataset.worldX,
      y: element.dataset.worldY,
      scale: element.dataset.worldScale,
    }));
    await miniMap.click({ position: { x: 12, y: 12 } });
    await expect.poll(() => viewport.evaluate(element => ({
      x: element.dataset.worldX,
      y: element.dataset.worldY,
    }))).not.toEqual({ x: cameraBefore.x, y: cameraBefore.y });

    await recenter.click();
    await expect.poll(() => viewport.evaluate(element => {
      const scale = Number(element.dataset.worldScale);
      const x = -Number(element.dataset.worldX) / scale;
      const y = -Number(element.dataset.worldY) / scale;
      const transform = element.querySelector('.react-transform-wrapper').getBoundingClientRect();
      const right = x + transform.width / scale;
      const bottom = y + transform.height / scale;
      const sceneRects = [...element.querySelectorAll('.game-element')].map(scene => {
        const rect = scene.getBoundingClientRect();
        const sceneStyle = scene;
        return {
          left: parseFloat(sceneStyle.style.left),
          top: parseFloat(sceneStyle.style.top),
          right: parseFloat(sceneStyle.style.left) + rect.width / scale,
          bottom: parseFloat(sceneStyle.style.top) + rect.height / scale,
        };
      });
      return sceneRects.every(scene => scene.left >= x - 1 && scene.top >= y - 1 && scene.right <= right + 1 && scene.bottom <= bottom + 1);
    })).toBe(true);
  } finally {
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});

test('Game World preferences persist inertia and free or 16 px scene movement choices', async () => {
  const { electronApp, engine } = await launchSampleProject();
  const viewport = engine.getByTestId('game-world-viewport');
  const original = await engine.evaluate(() => window.electronAPI.loadPreferences());
  try {
    await electronApp.evaluate(({ Menu }) => {
      const editMenu = Menu.getApplicationMenu()?.items.find(item => /edit/i.test(item.label));
      const preferencesItem = editMenu?.submenu?.items.find(item => /preferences|preferências|preferencias|préférences/i.test(item.label));
      if (!preferencesItem) throw new Error('Preferences menu item was not found');
      preferencesItem.click();
    });
    const dialog = engine.getByRole('dialog');
    const inertiaSwitch = engine.getByTestId('preferences-game-world-pan-inertia');
    const movementMode = engine.getByTestId('preferences-game-world-movement-mode');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Canvas Configuration');
    await expect(dialog.getByRole('button', { name: /^(Cancel|Save)$/ })).toHaveCount(0);
    await expect(inertiaSwitch).toBeVisible();
    await movementMode.locator('.ant-radio-button-wrapper').first().click();
    await inertiaSwitch.click();
    const dialogBounds = await dialog.boundingBox();
    const outsidePoint = await engine.evaluate(bounds => {
      const points = [
        { x: 8, y: 8 },
        { x: window.innerWidth - 8, y: 8 },
        { x: 8, y: window.innerHeight - 8 },
        { x: window.innerWidth - 8, y: window.innerHeight - 8 },
      ];
      return points.find(point => point.x < bounds.x || point.x > bounds.x + bounds.width
        || point.y < bounds.y || point.y > bounds.y + bounds.height);
    }, dialogBounds);
    expect(outsidePoint).toBeTruthy();
    await engine.mouse.click(outsidePoint.x, outsidePoint.y);

    await expect.poll(() => engine.evaluate(() => window.electronAPI.loadPreferences()))
      .toMatchObject({ gameWorldPanInertia: false, gameWorldMovementMode: 'free' });
    await expect(viewport).toHaveAttribute('data-pan-inertia', 'false');
    await expect(viewport).toHaveAttribute('data-scene-movement-mode', 'free');
    await expect(dialog).toHaveCount(0);
  } finally {
    await engine.evaluate(async values => {
      await window.electronAPI.setGameWorldPreferences({
        panInertia: values?.gameWorldPanInertia !== false,
        movementMode: values?.gameWorldMovementMode === 'free' ? 'free' : 'grid',
      });
    }, original);
    await electronApp.evaluate(({ app }) => app.exit(0));
  }
});
