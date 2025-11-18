import type { CanvasItem } from './types';

export function getMidpoint(item1: CanvasItem, item2: CanvasItem) {
  const x1 = item1.x + item1.width / 2;
  const y1 = item1.y + item1.height / 2;
  const x2 = item2.x + item2.width / 2;
  const y2 = item2.y + item2.height / 2;
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

export function getEdgePoint(source: CanvasItem, target: CanvasItem) {
  const sourceX = source.x + source.width / 2;
  const sourceY = source.y + source.height / 2;
  const targetX = target.x + target.width / 2;
  const targetY = target.y + target.height / 2;

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;

  const halfWidth = source.width / 2;
  const halfHeight = source.height / 2;

  if (dx === 0 && dy === 0) {
    return { x: sourceX, y: sourceY };
  }

  const angle = Math.atan2(dy, dx);
  
  const tanAngle = Math.tan(angle);
  const tanRect = halfHeight / halfWidth;

  let x, y;

  if (Math.abs(tanAngle) < tanRect) {
    // Intersects with left or right edge
    x = dx > 0 ? sourceX + halfWidth : sourceX - halfWidth;
    y = sourceY + (x - sourceX) * tanAngle;
  } else {
    // Intersects with top or bottom edge
    y = dy > 0 ? sourceY + halfHeight : sourceY - halfHeight;
    x = sourceX + (y - sourceY) / tanAngle;
  }

  return { x, y };
}
