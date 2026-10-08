const SIDE_MASK = 1 | 4 | 16 | 64;
const CORNERS = [
  { bit: 2, sides: [1, 4] },
  { bit: 8, sides: [4, 16] },
  { bit: 32, sides: [16, 64] },
  { bit: 128, sides: [64, 1] },
];

const canonicalMasks = new Set<number>();
for (let mask = 0; mask < 256; mask += 1) {
  let canonical = mask & SIDE_MASK;
  CORNERS.forEach(({ bit, sides }) => {
    if ((mask & bit) && sides.every(side => mask & side)) canonical |= bit;
  });
  canonicalMasks.add(canonical);
}

/** Canonical Blob-47 masks in their original numeric order, used to migrate saved slot arrays. */
const legacyBlob47Masks = Array.from(canonicalMasks).sort((left, right) => left - right);

const bitCount = (value: number): number => value.toString(2).replace(/0/g, '').length;
const sideBits = (mask: number): number => mask & SIDE_MASK;
const cornerBits = (mask: number): number => mask & (2 | 8 | 32 | 128);
const outerCornerMasks = legacyBlob47Masks.filter(mask =>
  bitCount(sideBits(mask)) === 2 && CORNERS.some(({ bit, sides }) =>
    sides.every(side => (sideBits(mask) & side) !== 0) && (mask & bit) !== 0,
  ),
);
const innerCornerMasks = legacyBlob47Masks.filter(mask =>
  bitCount(sideBits(mask)) === 2 && CORNERS.some(({ bit, sides }) =>
    sides.every(side => (sideBits(mask) & side) !== 0) && (mask & bit) === 0,
  ),
);
const innerHoleEdgeMasks = legacyBlob47Masks.filter(mask => mask === 17 || mask === 68);
const innerCornerAndHoleMasks = [...innerCornerMasks, ...innerHoleEdgeMasks];
const straightEdgeMasks = legacyBlob47Masks.filter(mask =>
  (bitCount(sideBits(mask)) === 3 && bitCount(cornerBits(mask)) === 2)
  || (bitCount(sideBits(mask)) === 4 && bitCount(cornerBits(mask)) === 3),
);
// Keep the requested straight-edge sequence together: blobs 32, 37, then 43.
const preferredStraightEdgeMasks = [legacyBlob47Masks[31], legacyBlob47Masks[36], legacyBlob47Masks[42]];
const orderedStraightEdgeMasks = [
  ...preferredStraightEdgeMasks,
  ...straightEdgeMasks.filter(mask => !preferredStraightEdgeMasks.includes(mask)),
];
const centerMasks = [255];
const stagedMasks = new Set([...centerMasks, ...outerCornerMasks, ...innerCornerMasks, ...straightEdgeMasks, ...innerHoleEdgeMasks]);
const combinationMasks = legacyBlob47Masks.filter(mask => !stagedMasks.has(mask));

/** Slot order matches the setup guidance: center, outer corners, edges, inner corners and hole edges, combinations. */
const partGroups = [centerMasks, outerCornerMasks, orderedStraightEdgeMasks, innerCornerAndHoleMasks, combinationMasks];
const legacyPartGroups = partGroups.map(masks => masks.map(mask => legacyBlob47Masks.indexOf(mask)));
const partOrder = legacyPartGroups.flat();
const moveBlobBefore = (blobNumber: number, targetBlobNumber: number) => {
  const sourceIndex = partOrder.indexOf(blobNumber - 1);
  const targetIndex = partOrder.indexOf(targetBlobNumber - 1);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
  const [partIndex] = partOrder.splice(sourceIndex, 1);
  partOrder.splice(partOrder.indexOf(targetBlobNumber - 1), 0, partIndex);
};
const moveBlobsBefore = (blobNumbers: number[], targetBlobNumber: number) => {
  const parts = blobNumbers.map(blobNumber => blobNumber - 1);
  parts.forEach(partIndex => {
    const index = partOrder.indexOf(partIndex);
    if (index >= 0) partOrder.splice(index, 1);
  });
  const targetIndex = partOrder.indexOf(targetBlobNumber - 1);
  if (targetIndex >= 0) partOrder.splice(targetIndex, 0, ...parts);
};
const moveBlobAfter = (blobNumber: number, targetBlobNumber: number) => {
  const sourceIndex = partOrder.indexOf(blobNumber - 1);
  if (sourceIndex < 0) return;
  const [partIndex] = partOrder.splice(sourceIndex, 1);
  const targetIndex = partOrder.indexOf(targetBlobNumber - 1);
  if (targetIndex >= 0) partOrder.splice(targetIndex + 1, 0, partIndex);
};

// This is the project's standard visual order. Blob numbers here refer to the legacy mask order.
moveBlobBefore(46, 34);
moveBlobBefore(45, 42);
moveBlobBefore(15, 8);
moveBlobBefore(14, 9);
moveBlobsBefore([17, 20, 21, 22], 10);
moveBlobsBefore([24, 28, 29, 36, 38], 23);
moveBlobBefore(35, 11);
moveBlobBefore(6, 3);
moveBlobBefore(38, 12);
moveBlobBefore(28, 18);
moveBlobBefore(36, 24);
moveBlobBefore(39, 31);
moveBlobBefore(41, 33);
moveBlobAfter(26, 40);

/** Canonical masks ordered by the standard Blob-47 positions. */
export const BLOB47_MASKS = partOrder.map(legacyIndex => legacyBlob47Masks[legacyIndex]);
export const BLOB47_MASK_INDEX = new Map(BLOB47_MASKS.map((mask, index) => [mask, index]));
export const BLOB47_PART_GROUPS = partGroups.map(masks => masks.map(mask => BLOB47_MASK_INDEX.get(mask)!));
export const BLOB47_HOLE_PREVIEW_PARTS = [33, 41, 44, 45]
  .map(blobNumber => BLOB47_MASK_INDEX.get(legacyBlob47Masks[blobNumber]));

/** Re-index a saved part array from the old numeric mask order to the standard Blob-47 order. */
export const migrateBlob47Parts = (parts: Array<number | null> = []): Array<number | null> => {
  const migrated = Array.from({ length: legacyBlob47Masks.length }, () => null as number | null);
  legacyBlob47Masks.forEach((mask, legacyIndex) => {
    const currentIndex = BLOB47_MASK_INDEX.get(mask);
    if (currentIndex != null) migrated[currentIndex] = parts[legacyIndex] ?? null;
  });
  return migrated;
};

export const getBlob47Mask = (isSameTerrain: (dx: number, dy: number) => boolean): number => {
  const neighbors = [
    [-1, -1, 128], [0, -1, 1], [1, -1, 2],
    [-1, 0, 64], [1, 0, 4],
    [-1, 1, 32], [0, 1, 16], [1, 1, 8],
  ] as const;
  let rawMask = 0;
  neighbors.forEach(([dx, dy, bit]) => { if (isSameTerrain(dx, dy)) rawMask |= bit; });
  let canonical = rawMask & SIDE_MASK;
  CORNERS.forEach(({ bit, sides }) => {
    if ((rawMask & bit) && sides.every(side => rawMask & side)) canonical |= bit;
  });
  return canonical;
};
