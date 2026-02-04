/**
 * Color mapper - Figma fills to Tailwind color classes
 */

import type { FigmaNodeDetails } from "../../figma/api.js";
import type { FillStyle } from "../utils/types.js";
import { rgbaToHex, findClosestTailwindColor, isFillVisible } from "../utils/color.js";

/**
 * Maps Figma fill properties to Tailwind CSS classes
 */
export class ColorMapper {
  constructor(
    private designTokens: Map<string, string> = new Map()
  ) {}

  /**
   * Map fill styles to background/border classes
   */
  mapFills(node: FigmaNodeDetails): string[] {
    const classes: string[] = [];

    if (!node.fills || node.fills.length === 0) {
      return classes;
    }

    // Get the first visible fill
    const visibleFill = node.fills.find(isFillVisible);

    if (!visibleFill) {
      return classes;
    }

    const bgClass = this.mapFill(visibleFill);
    if (bgClass) {
      classes.push(bgClass);
    }

    return classes;
  }

  /**
   * Map a single fill to a Tailwind class
   */
  mapFill(fill: FillStyle): string | null {
    switch (fill.type) {
      case "SOLID":
        return this.mapSolidFill(fill);
      case "GRADIENT_LINEAR":
        return this.mapLinearGradient(fill);
      case "GRADIENT_RADIAL":
        return this.mapRadialGradient(fill);
      default:
        return null;
    }
  }

  /**
   * Map solid fill to bg-{color} class
   */
  private mapSolidFill(fill: FillStyle): string | null {
    if (!fill.color) {
      return null;
    }

    const hex = rgbaToHex({ ...fill.color, a: fill.opacity });
    const opacity = fill.opacity ?? 1;

    // Check if this matches a design token first
    const tokenMatch = this.findTokenMatch(hex);
    if (tokenMatch) {
      return `bg-${tokenMatch}`;
    }

    // Check if this matches a Tailwind color
    const tailwindMatch = findClosestTailwindColor(hex);
    if (tailwindMatch) {
      // Apply opacity if less than 1
      if (opacity < 1) {
        return `bg-${tailwindMatch}/${this.opacityValue(opacity)}`;
      }
      return `bg-${tailwindMatch}`;
    }

    // Use arbitrary value
    if (opacity < 1) {
      return `bg-[${hex}] / ${this.opacityValue(opacity)}`;
    }
    return `bg-[${hex}]`;
  }

  /**
   * Map linear gradient to bg-gradient class
   */
  private mapLinearGradient(fill: FillStyle): string | null {
    if (!fill.gradientHandlePositions || !fill.gradientStops) {
      return null;
    }

    // Calculate angle from handle positions
    const start = fill.gradientHandlePositions[0];
    const end = fill.gradientHandlePositions[1];

    let angle = 0;
    if (start && end) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      angle = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
    }

    // Build gradient stops
    const stops = (fill.gradientStops || [])
      .map((stop) => {
        const color = rgbaToHex(stop.color);
        const position = Math.round((stop.position ?? 0) * 100);
        return `${color} ${position}%`;
      })
      .join(", ");

    // Use arbitrary value for custom gradient
    return `bg-[linear-gradient(${angle}deg,${stops})]`;
  }

  /**
   * Map radial gradient to bg-radial class
   */
  private mapRadialGradient(fill: FillStyle): string | null {
    if (!fill.gradientStops || fill.gradientStops.length === 0) {
      return null;
    }

    // Build gradient stops
    const stops = fill.gradientStops
      .map((stop) => {
        const color = rgbaToHex(stop.color);
        const position = Math.round((stop.position ?? 0) * 100);
        return `${color} ${position}%`;
      })
      .join(", ");

    // Use arbitrary value for radial gradient
    return `bg-[radial-gradient(circle,${stops})]`;
  }

  /**
   * Map stroke to border classes
   */
  mapStrokes(node: FigmaNodeDetails): string[] {
    const classes: string[] = [];

    if (!node.strokes || node.strokes.length === 0) {
      return classes;
    }

    const visibleStroke = node.strokes.find(isFillVisible);
    if (!visibleStroke) {
      return classes;
    }

    // Stroke weight (border width)
    const strokeWeight = (node as any).strokeWeight ?? 1;
    classes.push(this.mapStrokeWeight(strokeWeight));

    // Stroke color
    if (visibleStroke.color) {
      const hex = rgbaToHex({ ...visibleStroke.color, a: visibleStroke.opacity });
      const opacity = visibleStroke.opacity ?? 1;

      const tailwindMatch = findClosestTailwindColor(hex);
      if (tailwindMatch) {
        if (opacity < 1) {
          classes.push(`border-${tailwindMatch}/${this.opacityValue(opacity)}`);
        } else {
          classes.push(`border-${tailwindMatch}`);
        }
      } else {
        if (opacity < 1) {
          classes.push(`border-[${hex}] / ${this.opacityValue(opacity)}`);
        } else {
          classes.push(`border-[${hex}]`);
        }
      }
    }

    // Stroke alignment (not fully supported in CSS, default to inside)
    // const strokeAlign = node.strokeAlign; // INSIDE, OUTSIDE, CENTER

    return classes;
  }

  /**
   * Map stroke weight to border width class
   */
  private mapStrokeWeight(weight: number): string {
    // Tailwind's border width scale: 0, 1, 2, 4, 8
    const scale = [0, 1, 2, 4, 8];

    const closest = scale.reduce((prev, curr) =>
      Math.abs(curr - weight) < Math.abs(prev - weight) ? curr : prev
    );

    const scaleIndex = scale.indexOf(closest);
    return scaleIndex === 0 ? "border-0" : `border-${scaleIndex}`;
  }

  /**
   * Map corner radius to rounded classes
   */
  mapBorderRadius(node: FigmaNodeDetails): string[] {
    const classes: string[] = [];

    // Figma doesn't expose cornerRadius in node details directly
    const radius = (node as any).cornerRadius;
    const topLeftRadius = (node as any).rectangleCornerRadii?.[0];
    const effectiveRadius = radius ?? topLeftRadius;

    if (effectiveRadius === undefined || effectiveRadius === 0) {
      return classes;
    }

    // Tailwind's rounded scale: 0, 1, 2, 3, 4, 6, 8, 12, 16, 20, 24, 32, 48, 56, 64
    const scale = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64];

    const closest = scale.reduce((prev, curr) =>
      Math.abs(curr - effectiveRadius) < Math.abs(prev - effectiveRadius) ? curr : prev
    );

    if (Math.abs(effectiveRadius - closest) <= 4) {
      const scaleIndex = scale.indexOf(closest);
      classes.push(scaleIndex === 0 ? "rounded-none" : `rounded-${scaleIndex}`);
    } else {
      classes.push(`rounded-[${effectiveRadius}px]`);
    }

    return classes;
  }

  /**
   * Map opacity to opacity class
   */
  mapOpacity(node: FigmaNodeDetails): string[] {
    const classes: string[] = [];

    if (node.opacity === undefined || node.opacity >= 1) {
      return classes;
    }

    const percentage = Math.round(node.opacity * 100);
    classes.push(`opacity-${percentage}`);

    return classes;
  }

  /**
   * Find a matching design token for a hex color
   */
  private findTokenMatch(hex: string): string | null {
    for (const [name, value] of this.designTokens.entries()) {
      // Simple hex comparison
      if (value.toLowerCase() === hex.toLowerCase()) {
        return name;
      }
    }
    return null;
  }

  /**
   * Convert opacity to Tailwind percentage value
   */
  private opacityValue(opacity: number): string {
    const percentage = Math.round(opacity * 100);
    return percentage.toString();
  }

  /**
   * Map text color for text nodes
   */
  mapTextColor(node: FigmaNodeDetails): string[] {
    const classes: string[] = [];

    if (!node.fills || node.fills.length === 0) {
      // Default text color
      return ["text-current"];
    }

    const visibleFill = node.fills.find(isFillVisible);
    if (!visibleFill || !visibleFill.color) {
      return ["text-current"];
    }

    const hex = rgbaToHex({ ...visibleFill.color, a: visibleFill.opacity });
    const opacity = visibleFill.opacity ?? 1;

    const tailwindMatch = findClosestTailwindColor(hex);
    if (tailwindMatch) {
      if (opacity < 1) {
        classes.push(`text-${tailwindMatch}/${this.opacityValue(opacity)}`);
      } else {
        classes.push(`text-${tailwindMatch}`);
      }
    } else {
      if (opacity < 1) {
        classes.push(`text-[${hex}] / ${this.opacityValue(opacity)}`);
      } else {
        classes.push(`text-[${hex}]`);
      }
    }

    return classes;
  }
}
