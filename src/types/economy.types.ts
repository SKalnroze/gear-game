export interface ResourceState {
  gold: number;
  iron: number;
  crystal: number;
  aether: number;
  /** Feedstock for burners (electricity) and oilers. Mined, never passive. */
  coal: number;
}

export interface ResourceDelta {
  gold: number;  // positive = gain, negative = spend
  iron?: number;
  crystal?: number;
  aether?: number;
  coal?: number;
}
