import { createKitCache } from "./gearCache";
import type { GearKit } from "./gearKit";

/**
 * The one per-process cache of built gear kits, shared by /api/gear (which
 * builds them) and /api/gear/similar (which reads a kit's cap and products).
 */
export const gearKits = createKitCache<GearKit>();
