export type ResourceType = 'power' | 'gold' | 'iron' | 'crystal' | 'aether';

export const RESOURCE_COLORS: Record<ResourceType, number> = {
  power: 0x4488ff,
  gold: 0xffcc00,
  iron: 0x99aaaa,
  crystal: 0x00ffcc,
  aether: 0xcc44ff,
};
