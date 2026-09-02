export interface ResourceSnapshot {
  gold: number;
  iron: number;
  crystal: number;
  aether: number;
}

export interface TechSnapshot {
  total: number;
  gear: number;      // column 0: amplifiers, capacitors, overclock
  military: number;  // column 1: unit spawners, upgrades
  economy: number;   // column 2: gold/power efficiency
  defense: number;   // columns 3+4: fortification, special
}

export interface StatSnapshot {
  time: number;             // seconds from game start
  playerHp: number;
  aiHp: number;
  playerMaxHp: number;
  aiMaxHp: number;
  playerResources: ResourceSnapshot;
  aiResources: ResourceSnapshot;
  playerTech: TechSnapshot;
  aiTech: TechSnapshot;
  playerUnitTotal: number;
  aiUnitTotal: number;
  playerUnitByType: Record<string, number>;
  aiUnitByType: Record<string, number>;
}

export interface GameOverData {
  winner: 'player' | 'ai';
  /**
   * Which owner the human was playing, or null in a spectate match.
   * `winner` is an owner label, and the lobby can seat the human on either
   * side, so victory cannot be inferred from `winner === 'player'`.
   */
  humanOwner: 'player' | 'ai' | null;
  reason: string;
  difficulty: string;
  snapshots: StatSnapshot[];
  playerGearsPlaced: number;
  aiGearsPlaced: number;
  playerGearsLost: number;
  aiGearsLost: number;
  playerUnitsKilled: number;
  aiUnitsKilled: number;
  playerUnitsLost: number;
  aiUnitsLost: number;
  playerTechResearched: number;
  aiTechResearched: number;
}
