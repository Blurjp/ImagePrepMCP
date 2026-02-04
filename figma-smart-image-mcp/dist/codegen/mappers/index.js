/**
 * Mapper orchestration - combines all mappers to convert Figma nodes to Tailwind classes
 */
import { LayoutMapper } from "./layout.js";
import { ColorMapper } from "./color.js";
import { TypographyMapper } from "./typography.js";
/**
 * Main mapper class that orchestrates all individual mappers
 */
export class FigmaToTailwindMapper {
    layout;
    color;
    typography;
    constructor(context) {
        this.layout = new LayoutMapper();
        this.color = new ColorMapper(context.designTokens);
        this.typography = new TypographyMapper();
    }
    /**
     * Map all styles from a Figma node to Tailwind classes
     */
    mapNodeStyles(node) {
        const classes = [];
        // Layout classes (flexbox, padding, etc.)
        classes.push(...this.layout.mapAutoLayout(node));
        // Constraints
        classes.push(...this.layout.mapConstraints(node));
        // Dimensions
        classes.push(...this.layout.mapDimensions(node));
        // Background color
        classes.push(...this.color.mapFills(node));
        // Border (stroke)
        classes.push(...this.color.mapStrokes(node));
        // Border radius
        classes.push(...this.color.mapBorderRadius(node));
        // Opacity
        classes.push(...this.color.mapOpacity(node));
        // Typography (for text nodes)
        if (node.type === "TEXT") {
            classes.push(...this.typography.mapTextStyle(node));
            classes.push(...this.color.mapTextColor(node));
        }
        return classes;
    }
    /**
     * Get the layout mapper for specialized operations
     */
    getLayoutMapper() {
        return this.layout;
    }
    /**
     * Get the color mapper for specialized operations
     */
    getColorMapper() {
        return this.color;
    }
    /**
     * Get the typography mapper for specialized operations
     */
    getTypographyMapper() {
        return this.typography;
    }
}
//# sourceMappingURL=index.js.map