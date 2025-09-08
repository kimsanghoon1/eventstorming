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
  id: number;
  type: string;
  instanceName: string;
  properties: Property[];
  
  attributes?: UmlAttribute[];
  methods?: UmlOperation[];
  linkedDiagram?: string | null;
  stereotype?: string;
  enumValues?: string[];

  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  parent: number | null;
  children?: number[];
  connectedPolicies?: number[];
}

export interface Connection {
  id: string;
  from: number;
  to: number;
  type: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
}
