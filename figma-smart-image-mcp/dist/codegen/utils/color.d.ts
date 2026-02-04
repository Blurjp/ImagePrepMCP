/**
 * Color utilities for code generation
 */
import type { Color, FillStyle } from "./types.js";
/**
 * Convert RGBA color (0-1 range) to hex string
 */
export declare function rgbaToHex(color: Color): string;
/**
 * Convert RGBA color to CSS rgb() string
 */
export declare function rgbaToCss(color: Color): string;
/**
 * Convert hex color to RGB object (0-1 range)
 */
export declare function hexToRgba(hex: string): Color;
/**
 * Calculate the perceived brightness of a color (0-1)
 */
export declare function getBrightness(color: Color): number;
/**
 * Determine if a color is "light" (brightness > 0.5)
 */
export declare function isLightColor(color: Color): boolean;
/**
 * Find the closest matching Tailwind color name for a hex color
 */
export declare function findClosestTailwindColor(hex: string): string | null;
/**
 * Check if a fill style is visible
 */
export declare function isFillVisible(fill: FillStyle): boolean;
//# sourceMappingURL=color.d.ts.map