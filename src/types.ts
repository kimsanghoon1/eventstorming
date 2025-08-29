export interface Property {
  key: string;
  value: string;
}

export interface CanvasItem {
  id: number;
  type: string; // e.g., 'Command', 'Event'
  instanceName: string; // e.g., 'CreateUser', 'UserCreated'
  properties: Property[];
}
