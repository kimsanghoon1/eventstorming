import type { CanvasItem, Property, UmlAttribute, UmlOperation } from '@/types';

const UML_TYPES = new Set(['Class', 'Interface', 'Enum', 'Package', 'Component', 'Actor', 'Relationship']);
const EVENT_TYPES = new Set(['Command', 'Event', 'Aggregate', 'Policy', 'ContextBox', 'Actor', 'ReadModel']);
export const UML_MIN_WIDTH = 180;
export const UML_BASE_WIDTH = 220;
export const UML_CHAR_PIXEL = 8;
export const UML_ROW_HEIGHT = 18;
export const UML_SECTION_GAP = 12;
export const UML_HEADER_BASE = 60;
export const UML_BOTTOM_PADDING = 20;
const EVENT_BASE_WIDTH = 180;
const EVENT_BASE_HEIGHT = 90;
const EVENT_CHAR_PIXEL = 8;

const visibilitySymbol = (visibility?: string) => {
  switch (visibility) {
    case 'protected':
      return '#';
    case 'private':
      return '-';
    case 'public':
      return '+';
    case 'package':
      return '~';
    default:
      return '';
  }
};

const formatAttribute = (attr: UmlAttribute) => {
  const visibility = visibilitySymbol(attr.visibility);
  const type = attr.type ? `: ${attr.type}` : '';
  const defaultValue = attr.defaultValue ? ` = ${attr.defaultValue}` : '';
  return `${visibility} ${attr.name || 'attr'}${type}${defaultValue}`.trim();
};

const formatOperation = (op: UmlOperation) => {
  const visibility = visibilitySymbol(op.visibility);
  const params = op.parameters?.map(p => `${p.name}: ${p.type || 'any'}`).join(', ') || '';
  const returnType = op.returnType ? `: ${op.returnType}` : '';
  return `${visibility} ${op.name || 'method'}(${params})${returnType}`.trim();
};

const formatProperty = (prop: Property) => `${prop.key || 'key'}: ${prop.value ?? ''}`.trim();

const estimateLineWidth = (text: string) =>
  Math.max(UML_MIN_WIDTH, text.length * UML_CHAR_PIXEL + 32);

const collectContentLines = (item: Partial<CanvasItem>): string[] => {
  const lines: string[] = [];
  if (item.instanceName) {
    lines.push(item.instanceName);
  }
  if (item.properties?.length) {
    lines.push(...item.properties.map(formatProperty));
  }
  if (item.attributes?.length) {
    lines.push(...item.attributes.map(formatAttribute));
  }
  if (item.methods?.length) {
    lines.push(...item.methods.map(formatOperation));
  }
  if (item.enumValues?.length) {
    lines.push(...item.enumValues);
  }
  return lines;
};

export const isUmlCanvasItem = (item?: Partial<CanvasItem>) => Boolean(item && UML_TYPES.has(item.type || ''));

export const ensureUmlItemDimensions = <T extends Partial<CanvasItem>>(item: T): T => {
  if (!isUmlCanvasItem(item)) {
    return item;
  }

  const contentLines = collectContentLines(item);
  const maxLineWidth = contentLines.length
    ? Math.max(...contentLines.map(estimateLineWidth))
    : UML_MIN_WIDTH;

  const sectionCounts = [
    item.properties?.length || 0,
    item.attributes?.length || 0,
    item.methods?.length || 0,
    item.enumValues?.length || 0,
  ];

  const visibleSections = sectionCounts.filter(count => count > 0).length;
  let detailHeight = sectionCounts.reduce((acc, count) => acc + count * UML_ROW_HEIGHT, 0);
  if (visibleSections > 1) {
    detailHeight += (visibleSections - 1) * UML_SECTION_GAP;
  }

  let headerHeight = UML_HEADER_BASE;
  if (item.stereotype) headerHeight += UML_ROW_HEIGHT * 0.6;
  if (item.type === 'Interface') headerHeight += UML_ROW_HEIGHT * 0.6;

  const requiredWidth = Math.max(item.width ?? 0, UML_BASE_WIDTH, maxLineWidth);
  const requiredHeight = Math.max(
    item.height ?? 0,
    headerHeight + detailHeight + UML_BOTTOM_PADDING
  );

  const next: T = {
    ...item,
    width: requiredWidth,
    height: requiredHeight,
  };

  return next;
};

export const isEventCanvasItem = (item?: Partial<CanvasItem>) =>
  Boolean(item && EVENT_TYPES.has(item.type || ''));

const ensureEventItemDimensions = <T extends Partial<CanvasItem>>(item: T): T => {
  if (!isEventCanvasItem(item)) {
    return item;
  }

  const lines: string[] = [];
  if (item.type) lines.push(item.type);
  if (item.instanceName) lines.push(item.instanceName);
  if (item.description) lines.push(item.description);
  if (item.properties?.length) {
    lines.push(...item.properties.map(formatProperty));
  }

  const requiredWidth = Math.max(
    item.width ?? 0,
    EVENT_BASE_WIDTH,
    ...lines.map(line => line.length * EVENT_CHAR_PIXEL + 48)
  );

  const extraHeight = (item.properties?.length || 0) * UML_ROW_HEIGHT * 0.9;

  return {
    ...item,
    width: requiredWidth,
    height: Math.max(item.height ?? 0, EVENT_BASE_HEIGHT + extraHeight),
  };
};

export const ensureCanvasItemDimensions = <T extends Partial<CanvasItem>>(item: T): T => {
  if (isUmlCanvasItem(item)) return ensureUmlItemDimensions(item);
  if (isEventCanvasItem(item)) return ensureEventItemDimensions(item);
  return item;
};

