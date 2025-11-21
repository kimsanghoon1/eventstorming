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

export function getOrthogonalPoints(source: CanvasItem, target: CanvasItem): number[] {
  const sourceCenter = {
    x: source.x + source.width / 2,
    y: source.y + source.height / 2,
  };
  const targetCenter = {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
  };

  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;

  // Determine start and end points on the edges
  let startPoint, endPoint;

  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal dominance
    if (dx > 0) {
      startPoint = { x: source.x + source.width, y: sourceCenter.y };
      endPoint = { x: target.x, y: targetCenter.y };
    } else {
      startPoint = { x: source.x, y: sourceCenter.y };
      endPoint = { x: target.x + target.width, y: targetCenter.y };
    }
  } else {
    // Vertical dominance
    if (dy > 0) {
      startPoint = { x: sourceCenter.x, y: source.y + source.height };
      endPoint = { x: targetCenter.x, y: target.y };
    } else {
      startPoint = { x: sourceCenter.x, y: source.y };
      endPoint = { x: targetCenter.x, y: target.y + target.height };
    }
  }

  // Calculate intermediate points for elbow
  const midX = (startPoint.x + endPoint.x) / 2;
  const midY = (startPoint.y + endPoint.y) / 2;

  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal start
    return [startPoint.x, startPoint.y, midX, startPoint.y, midX, endPoint.y, endPoint.x, endPoint.y];
  } else {
    // Vertical start
    return [startPoint.x, startPoint.y, startPoint.x, midY, endPoint.x, midY, endPoint.x, endPoint.y];
  }
}
