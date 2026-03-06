export interface ResourceState {
  gold: number;
  iron: number;
  crystal: number;
  aether: number;
}

export interface ResourceDelta {
  gold: number;  // positive = gain, negative = spend
  iron?: number;
  crystal?: number;
  aether?: number;
}
