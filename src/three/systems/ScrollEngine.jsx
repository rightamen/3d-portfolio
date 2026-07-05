const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export const getScrollProgress = (
  scrollY,
  scrollHeight,
  viewportHeight,
) => {
  const maxScrollable = Math.max(scrollHeight - viewportHeight, 1);
  return clamp(scrollY / maxScrollable);
};

export const calculateScrollOffset = (progress, start, end) => {
  const normalized = clamp(progress);
  return start + (end - start) * normalized;
};

export const mapScrollTo3DPosition = (
  progress,
  ranges = { x: [0, 0], y: [0, 0], z: [0, 0] },
) => ({
  x: calculateScrollOffset(progress, ranges.x[0], ranges.x[1]),
  y: calculateScrollOffset(progress, ranges.y[0], ranges.y[1]),
  z: calculateScrollOffset(progress, ranges.z[0], ranges.z[1]),
});
