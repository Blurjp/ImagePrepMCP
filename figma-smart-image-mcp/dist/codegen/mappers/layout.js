/**
 * Layout mapper - Figma Auto Layout to Tailwind Flexbox classes
 */
/**
 * Maps Figma layout properties to Tailwind CSS classes
 */
export class LayoutMapper {
    /**
     * Map Auto Layout properties to Tailwind flex classes
     */
    mapAutoLayout(node) {
        const classes = [];
        // Base flex container
        if (node.layoutMode) {
            classes.push("flex");
            if (node.layoutMode === "HORIZONTAL") {
                classes.push("flex-row");
            }
            else if (node.layoutMode === "VERTICAL") {
                classes.push("flex-col");
            }
        }
        // Primary axis alignment (mainAxisAlignment in Figma)
        if (node.layoutMode === "HORIZONTAL") {
            // Horizontal: primary axis is horizontal → justify
            classes.push(this.mapPrimaryAxisAlign(node));
        }
        else if (node.layoutMode === "VERTICAL") {
            // Vertical: primary axis is vertical → justify
            classes.push(this.mapPrimaryAxisAlign(node));
        }
        // Counter axis alignment (counterAxisAlignment in Figma)
        if (node.layoutMode === "HORIZONTAL") {
            // Horizontal: counter axis is vertical → items
            classes.push(this.mapCounterAxisAlign(node));
        }
        else if (node.layoutMode === "VERTICAL") {
            // Vertical: counter axis is horizontal → items
            classes.push(this.mapCounterAxisAlign(node));
        }
        // Item spacing (gap)
        if (node.itemSpacing !== undefined && node.itemSpacing > 0) {
            classes.push(this.mapSpacing(node.itemSpacing, "gap"));
        }
        // Padding
        const paddingClasses = this.mapPadding(node);
        classes.push(...paddingClasses);
        // Sizing mode (FILL container → flex-grow or width/height 100%)
        const sizingClasses = this.mapSizingMode(node);
        classes.push(...sizingClasses);
        return classes;
    }
    /**
     * Map primary axis alignment (mainAxisAlignment)
     * Figma: MIN, CENTER, MAX, SPACE_BETWEEN
     * Tailwind: justify-start, justify-center, justify-end, justify-between
     */
    mapPrimaryAxisAlign(node) {
        // Figma doesn't directly expose this in node details, infer from defaults
        // Default is MIN (start)
        const primaryAlign = node.primaryAxisAlignMode || "MIN";
        switch (primaryAlign) {
            case "MIN":
                return "justify-start";
            case "CENTER":
                return "justify-center";
            case "MAX":
                return "justify-end";
            case "SPACE_BETWEEN":
                return "justify-between";
            default:
                return "justify-start";
        }
    }
    /**
     * Map counter axis alignment (counterAxisAlignment)
     * Figma: MIN, CENTER, MAX
     * Tailwind: items-start, items-center, items-end
     */
    mapCounterAxisAlign(node) {
        const counterAlign = node.counterAxisAlignMode || "MIN";
        switch (counterAlign) {
            case "MIN":
                return "items-start";
            case "CENTER":
                return "items-center";
            case "MAX":
                return "items-end";
            default:
                return "items-start";
        }
    }
    /**
     * Map pixel spacing to Tailwind spacing scale
     */
    mapSpacing(pixels, prefix) {
        // Tailwind's default spacing scale
        const scale = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 160, 192, 224, 256, 288, 320];
        // Find the closest match
        let closest = scale[0];
        let minDiff = Math.abs(pixels - closest);
        for (const value of scale) {
            const diff = Math.abs(pixels - value);
            if (diff < minDiff) {
                minDiff = diff;
                closest = value;
            }
        }
        // Use arbitrary value if the match isn't close enough
        if (minDiff > 4) {
            return `${prefix}-[${pixels}px]`;
        }
        const scaleIndex = scale.indexOf(closest);
        if (scaleIndex === 0) {
            return `${prefix}-0`;
        }
        return `${prefix}-${scaleIndex}`;
    }
    /**
     * Map padding to Tailwind classes
     */
    mapPadding(node) {
        const classes = [];
        const pt = node.paddingTop ?? 0;
        const pr = node.paddingRight ?? 0;
        const pb = node.paddingBottom ?? 0;
        const pl = node.paddingLeft ?? 0;
        // Check if uniform
        if (pt === pr && pr === pb && pb === pl) {
            if (pt > 0) {
                classes.push(this.mapSpacing(pt, "p"));
            }
            return classes;
        }
        // Check if horizontal/vertical uniform
        if (pt === pb && pl === pr) {
            if (pt > 0) {
                classes.push(this.mapSpacing(pt, "py"));
            }
            if (pl > 0) {
                classes.push(this.mapSpacing(pl, "px"));
            }
            return classes;
        }
        // Individual sides
        if (pt > 0)
            classes.push(this.mapSpacing(pt, "pt"));
        if (pr > 0)
            classes.push(this.mapSpacing(pr, "pr"));
        if (pb > 0)
            classes.push(this.mapSpacing(pb, "pb"));
        if (pl > 0)
            classes.push(this.mapSpacing(pl, "pl"));
        return classes;
    }
    /**
     * Map sizing mode (primaryAxisSizingMode, counterAxisSizingMode)
     * Figma: FIXED, FILL
     * Tailwind: flex-grow, w-full, h-full
     */
    mapSizingMode(node) {
        const classes = [];
        if (!node.layoutMode) {
            return classes;
        }
        // Primary axis sizing
        if (node.primaryAxisSizingMode === "FILL") {
            classes.push("flex-1");
        }
        // Counter axis sizing
        if (node.counterAxisSizingMode === "FILL") {
            if (node.layoutMode === "HORIZONTAL") {
                // Horizontal layout, counter axis is vertical → h-full
                classes.push("h-full");
            }
            else {
                // Vertical layout, counter axis is horizontal → w-full
                classes.push("w-full");
            }
        }
        return classes;
    }
    /**
     * Map constraints to Tailwind classes
     * Figma constraints: SCALE, LEFT, RIGHT, TOP, BOTTOM, LEFT_RIGHT, TOP_BOTTOM, CENTER
     */
    mapConstraints(node) {
        const classes = [];
        if (!node.constraints) {
            return classes;
        }
        const { vertical, horizontal } = node.constraints;
        // Horizontal constraints
        switch (horizontal) {
            case "LEFT":
                // Default behavior, no class needed
                break;
            case "RIGHT":
                classes.push("self-end");
                break;
            case "LEFT_RIGHT":
                classes.push("flex-1");
                break;
            case "CENTER":
                classes.push("mx-auto");
                break;
            case "SCALE":
                classes.push("w-full");
                break;
        }
        // Vertical constraints
        switch (vertical) {
            case "TOP":
                // Default behavior, no class needed
                break;
            case "BOTTOM":
                classes.push("self-end");
                break;
            case "TOP_BOTTOM":
                classes.push("flex-1");
                break;
            case "CENTER":
                classes.push("my-auto");
                break;
            case "SCALE":
                classes.push("h-full");
                break;
        }
        return classes;
    }
    /**
     * Get explicit width/height from bounding box
     */
    mapDimensions(node) {
        const classes = [];
        if (!node.absoluteBoundingBox) {
            return classes;
        }
        const { width, height } = node.absoluteBoundingBox;
        // Only add explicit dimensions if not using FILL sizing
        if (node.primaryAxisSizingMode !== "FILL" && node.counterAxisSizingMode !== "FILL") {
            // Use arbitrary values for exact dimensions
            if (width && width > 0 && !node.layoutMode) {
                classes.push(`w-[${width}px]`);
            }
            if (height && height > 0 && !node.layoutMode) {
                classes.push(`h-[${height}px]`);
            }
        }
        return classes;
    }
}
//# sourceMappingURL=layout.js.map