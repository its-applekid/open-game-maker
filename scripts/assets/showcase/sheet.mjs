export function fittedSheetScale(frame, cellWidth, cellHeight, requestedScale) {
  const maxWidth = cellWidth * 0.82;
  const maxHeight = cellHeight * 0.82;
  const fitting = Math.max(
    1,
    Math.min(4, Math.floor(maxWidth / frame.width), Math.floor(maxHeight / frame.height)),
  );
  return requestedScale === undefined ? fitting : Math.min(requestedScale, fitting);
}
