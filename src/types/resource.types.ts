/**
 * Stockpiled resources. Electricity is deliberately absent: it is a per-tick
 * flow across a wire network, not a number in a bank, so it lives in
 * PowerSystem rather than here. An earlier 'power' entry survived here for a
 * while after the concept was cut, describing a resource that no longer
 * existed.
 */
export type ResourceType = 'gold' | 'iron' | 'crystal' | 'aether' | 'coal';

export const RESOURCE_COLORS: Record<ResourceType, number> = {
  gold: 0xffcc00,
  iron: 0x99aaaa,
  crystal: 0x00ffcc,
  aether: 0xcc44ff,
  coal: 0x776655,
};
