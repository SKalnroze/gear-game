import { GearType } from '../types/gear.types';
import { World } from '../world/World';
import { GearMeshGraph } from '../world/GearMeshGraph';
import { GEAR_DEFINITIONS, GEAR_MESH_TOLERANCE, gearRadius } from '../constants/gear.constants';
import { AI_ZONE_MIN_X, WORLD_WIDTH, WORLD_HEIGHT } from '../constants/world.constants';
import { gearsAreMeshing } from '../utils/MathUtils';
import { randomInt } from '../utils/MathUtils';

interface PlacementScore {
  x: number;
  y: number;
  score: number;
}

/**
 * Scores pixel positions for AI gear placement.
 * Score = mesh_connections×3 + synergy_bonus×5 - distance_from_front×0.3
 */
export class AIPlanner {
  static scorePlacements(
    gearType: GearType,
    teeth: number,
    world: World,
    _meshGraph: GearMeshGraph,
    sampleCount: number = 30,
  ): PlacementScore[] {
    const def = GEAR_DEFINITIONS[gearType];
    if (!def) return [];

    const radius = gearRadius(teeth);
    const allGears = world.getAllGears();
    const scores: PlacementScore[] = [];

    for (let i = 0; i < sampleCount; i++) {
      const x = randomInt(AI_ZONE_MIN_X + radius + 10, WORLD_WIDTH - radius - 10);
      const y = randomInt(radius + 10, WORLD_HEIGHT - radius - 10);

      if (!world.canPlace(x, y, teeth, 'ai')) continue;

      let score = 0;

      let meshCount = 0;
      let synergyBonus = 0;

      for (const [, existingGear] of allGears) {
        if (existingGear.owner !== 'ai') continue;
        const exRadius = gearRadius(existingGear.teeth);

        if (gearsAreMeshing(x, y, radius, existingGear.x, existingGear.y, exRadius, GEAR_MESH_TOLERANCE)) {
          meshCount++;
          if (gearType === 'amplifier' && existingGear.type === 'motor') synergyBonus += 5;
        }
      }

      score += meshCount * 3;
      score += synergyBonus;

      // Prefer positions close to the front (left side of AI zone)
      const distFromFront = x - AI_ZONE_MIN_X;
      score -= distFromFront * 0.003;

      scores.push({ x, y, score });
    }

    return scores.sort((a, b) => b.score - a.score);
  }

  static getBestPlacement(
    gearType: GearType,
    teeth: number,
    world: World,
    meshGraph: GearMeshGraph,
  ): { x: number; y: number } | null {
    const scores = this.scorePlacements(gearType, teeth, world, meshGraph);
    return scores.length > 0 ? { x: scores[0].x, y: scores[0].y } : null;
  }
}
