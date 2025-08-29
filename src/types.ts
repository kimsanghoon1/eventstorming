export interface Property {
  key: string;
  value: string;
}

export interface CanvasItem {
  id: number;
  type: string; // e.g., 'Command', 'Event'
  instanceName: string; // e.g., 'CreateUser', 'UserCreated'
  properties: Property[];
  x: number;
  y: number;
}

export interface Connection {
  id: string;
  from: number; // ID of the source CanvasItem
  to: number;   // ID of the target CanvasItem
}
