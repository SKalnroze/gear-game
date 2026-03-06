export interface AIResearchPlan {
  prioritizedQueue: string[];   // tech node IDs in priority order
  currentGoal: string;          // human-readable e.g. "unlock cavalry spawner"
  lastRebuildAt: number;
}
