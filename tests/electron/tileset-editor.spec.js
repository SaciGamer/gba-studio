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

async function openTilesetEditor() {
  const electronApp = await electron.launch({ args: [electronEntryPoint, sampleProject] });
  try {
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

  const scene = engine.locator('.game-element').first();
  await scene.evaluate(element => element.click());
  await scene.hover();
  const editTilesButton = engine.locator('button[aria-label="Edit tiles"]');
  await expect(editTilesButton).toBeVisible();
  await editTilesButton.evaluate(button => button.click());
  await engine.getByRole('button', { name: 'Tiles (l)' }).click();
  await expect(engine.getByText(/^Layer 2$/)).toBeVisible();
  return { electronApp, engine };
  } catch (error) {
    await electronApp.close();
    throw error;
  }
}

test('tileset controls and auto-tile slots are available', async () => {
  test.setTimeout(45_000);
  const { electronApp, engine } = await openTilesetEditor();
  try {
    const gridCheckbox = engine.getByRole('checkbox', { name: /^(Grid|Grade|Cuadrícula|Grille)$/i });
    await expect(gridCheckbox).toBeVisible();
    await expect(gridCheckbox).toBeChecked();

    await engine.getByText(/^16×16$/).click();
    await expect(engine.getByRole('radio', { name: '16×16' })).toBeChecked();

    await gridCheckbox.uncheck();
    await expect(gridCheckbox).not.toBeChecked();

    await engine.getByText(/^Auto-tiles$/i).click();
    await expect(engine.getByRole('dialog')).toBeHidden();
    await expect(engine.getByTestId('auto-tile-slots-view')).toBeVisible();
    await expect(engine.getByText(/Auto-Tile Slots|Slots de auto-tile|Espacios de auto-tile|Emplacements d’auto-tile/i)).toHaveCount(0);
    await engine.getByTitle('Tileset').click();
    await engine.getByText(/^Auto-tiles$/i).click();
    await expect(engine.getByRole('dialog')).toBeHidden();
    await engine.getByRole('button', { name: /Auto-tile Settings|Configurações do auto-tile|Configuración del auto-tile|Paramètres de l’auto-tile/i }).click();
    const dialog = engine.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: /Auto-tile source tileset|Tileset de origem do auto-tile|Tileset de origen del auto-tile|Tileset source de l’auto-tile/i })).toBeVisible();

    const slotButtons = engine.getByRole('dialog').getByRole('button', {
      name: /^(Slot|Espaço|Espacio|Emplacement) [1-8]$/i,
    });
    await expect(slotButtons).toHaveCount(8);
    const partGrid = engine.getByTestId('auto-tile-part-grid');
    await expect(partGrid.getByRole('button')).toHaveCount(1);
    await expect(engine.getByTestId('auto-tile-preview')).toBeVisible();
    expect(await engine.getByTestId('auto-tile-configuration-layout').evaluate(layout =>
      layout.firstElementChild?.firstElementChild?.getAttribute('data-testid') === 'auto-tile-preview'
      && layout.firstElementChild?.children[1]?.getAttribute('data-testid') === 'auto-tile-part-grid'
      && getComputedStyle(layout).justifyContent === 'flex-start'
      && getComputedStyle(layout.firstElementChild?.children[1]).gridTemplateColumns.split(' ').length === 8,
    )).toBe(true);
    await expect(partGrid.getByRole('button').first()).toBeVisible();
    await expect(engine.getByTestId('auto-tile-selected-part-preview')).toBeVisible();
    await expect(engine.getByText(/No 16×16 tiles available|Nenhum tile 16×16 disponível|No hay tiles de 16×16 disponibles|Aucune tuile 16×16 disponible/i)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^(OK|Cancel|Cancelar|Annuler)$/i })).toHaveCount(0);
    await engine.locator('.ant-modal-close').click();
    await expect(engine.getByRole('dialog')).toBeHidden();
  } finally {
    await electronApp.close();
  }
});
