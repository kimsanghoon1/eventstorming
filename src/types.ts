export interface Property {
  key: string;
  value: string;
}

export interface UmlParameter {
  name: string;
  type: string;
  direction: 'in' | 'out' | 'inout';
}

export interface UmlAttribute {
  visibility: 'public' | 'private' | 'protected' | 'package';
  name: string;
  type: string;
  defaultValue?: string;
}

export interface UmlOperation {
  visibility: 'public' | 'private' | 'protected' | 'package';
  name: string;
  parameters: UmlParameter[];
  returnType: string;
}

export interface CanvasItem {
  id: string;
  type: string;
  instanceName: string;
  description?: string;
  properties: Property[];

  attributes?: UmlAttribute[];
  methods?: UmlOperation[];
  linkedDiagram?: string | null;
  stereotype?: string;
  enumValues?: string[];
  producesEventId?: string | null;

  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  parent: string | null;
  children?: string[];
  connectedPolicies?: string[];
}

export interface Connection {
  id: string;
  from: string;
  to: string;
  type: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  points?: number[];
}
