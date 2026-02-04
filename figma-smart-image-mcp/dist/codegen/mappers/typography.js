/**
 * Typography mapper - Figma text styles to Tailwind typography classes
 */
/**
 * Maps Figma text properties to Tailwind CSS classes
 */
export class TypographyMapper {
    /**
     * Map all text styles to Tailwind classes
     */
    mapTextStyle(node) {
        const classes = [];
        if (!node.style) {
            return classes;
        }
        const { style } = node;
        // Font size
        if (style.fontSize) {
            classes.push(this.mapFontSize(style.fontSize));
        }
        // Font weight
        if (style.fontWeight !== undefined) {
            classes.push(this.mapFontWeight(style.fontWeight));
        }
        // Line height
        if (style.lineHeightPx !== undefined) {
            classes.push(this.mapLineHeight(style.lineHeightPx, style.fontSize || 16));
        }
        // Letter spacing
        if (style.letterSpacing) {
            classes.push(this.mapLetterSpacing(style.letterSpacing));
        }
        // Text align
        if (style.textAlignHorizontal) {
            classes.push(this.mapTextAlign(style.textAlignHorizontal));
        }
        // Text decoration (underline, strikethrough)
        if (style.textDecoration) {
            classes.push(this.mapTextDecoration(style.textDecoration));
        }
        // Text transform (uppercase, lowercase, etc.)
        if (style.textCase) {
            classes.push(this.mapTextCase(style.textCase));
        }
        // Font family (basic mapping)
        if (style.fontFamily) {
            classes.push(this.mapFontFamily(style.fontFamily));
        }
        // Italic
        if (style.italic) {
            classes.push("italic");
        }
        return classes;
    }
    /**
     * Map font size to text-{size} class
     */
    mapFontSize(fontSize) {
        // Tailwind's font size scale (px)
        const scale = [
            { size: 12, class: "text-xs" },
            { size: 14, class: "text-sm" },
            { size: 16, class: "text-base" },
            { size: 18, class: "text-lg" },
            { size: 20, class: "text-xl" },
            { size: 24, class: "text-2xl" },
            { size: 30, class: "text-3xl" },
            { size: 36, class: "text-4xl" },
            { size: 48, class: "text-5xl" },
            { size: 60, class: "text-6xl" },
            { size: 72, class: "text-7xl" },
            { size: 96, class: "text-8xl" },
            { size: 128, class: "text-9xl" },
        ];
        // Find the closest match
        let closest = scale[0];
        let minDiff = Math.abs(fontSize - closest.size);
        for (const entry of scale) {
            const diff = Math.abs(fontSize - entry.size);
            if (diff < minDiff) {
                minDiff = diff;
                closest = entry;
            }
        }
        // Use arbitrary value if the match isn't close enough (within 2px)
        if (minDiff > 2) {
            return `text-[${fontSize}px]`;
        }
        return closest.class;
    }
    /**
     * Map font weight to font-{weight} class
     */
    mapFontWeight(fontWeight) {
        // Tailwind's font weight scale
        const scale = [
            { weight: 100, class: "font-thin" },
            { weight: 200, class: "font-extralight" },
            { weight: 300, class: "font-light" },
            { weight: 400, class: "font-normal" },
            { weight: 500, class: "font-medium" },
            { weight: 600, class: "font-semibold" },
            { weight: 700, class: "font-bold" },
            { weight: 800, class: "font-extrabold" },
            { weight: 900, class: "font-black" },
        ];
        // Find the closest match
        let closest = scale[0];
        let minDiff = Math.abs(fontWeight - closest.weight);
        for (const entry of scale) {
            const diff = Math.abs(fontWeight - entry.weight);
            if (diff < minDiff) {
                minDiff = diff;
                closest = entry;
            }
        }
        // If within 50 of a scale value, use it
        if (minDiff <= 50) {
            return closest.class;
        }
        // Use arbitrary value for unusual weights
        return `font-[${fontWeight}]`;
    }
    /**
     * Map line height to leading class
     */
    mapLineHeight(lineHeightPx, fontSize) {
        // Calculate line height as a ratio
        const ratio = lineHeightPx / fontSize;
        // Tailwind's line height scale
        const scale = [
            { ratio: 1, class: "leading-none" },
            { ratio: 1.25, class: "leading-tight" },
            { ratio: 1.375, class: "leading-snug" },
            { ratio: 1.5, class: "leading-normal" },
            { ratio: 1.625, class: "leading-relaxed" },
            { ratio: 2, class: "leading-loose" },
        ];
        // Find the closest match
        let closest = scale[0];
        let minDiff = Math.abs(ratio - closest.ratio);
        for (const entry of scale) {
            const diff = Math.abs(ratio - entry.ratio);
            if (diff < minDiff) {
                minDiff = diff;
                closest = entry;
            }
        }
        // If within 0.1 of a scale value, use it
        if (minDiff <= 0.1) {
            return closest.class;
        }
        // Use arbitrary value
        return `leading-[${lineHeightPx}px]`;
    }
    /**
     * Map letter spacing to tracking class
     */
    mapLetterSpacing(letterSpacing) {
        // Figma uses pixels, Tailwind uses em (approximately)
        // For 16px font base, 1px ≈ 0.0625em
        const em = Math.abs(letterSpacing / 16);
        const isNegative = letterSpacing < 0;
        // Tailwind's tracking scale (em values)
        const scale = [
            { em: -0.05, class: "tracking-tighter" },
            { em: -0.025, class: "tracking-tight" },
            { em: 0, class: "tracking-normal" },
            { em: 0.025, class: "tracking-wide" },
            { em: 0.05, class: "tracking-wider" },
            { em: 0.1, class: "tracking-widest" },
        ];
        // Find the closest match
        let closest = scale[2]; // Default to normal
        let minDiff = Math.abs(em - closest.em);
        for (const entry of scale) {
            const diff = Math.abs(em - entry.em);
            if (diff < minDiff) {
                minDiff = diff;
                closest = entry;
            }
        }
        // If within 0.02 of a scale value, use it
        if (minDiff <= 0.02) {
            return closest.class;
        }
        // Use arbitrary value
        const sign = isNegative ? "-" : "";
        return `tracking-[${sign}${em.toFixed(3)}em]`;
    }
    /**
     * Map text align to text-align class
     */
    mapTextAlign(align) {
        switch (align.toLowerCase()) {
            case "left":
                return "text-left";
            case "right":
                return "text-right";
            case "center":
                return "text-center";
            case "justified":
                return "text-justify";
            default:
                return "text-left";
        }
    }
    /**
     * Map text decoration to class
     */
    mapTextDecoration(decoration) {
        switch (decoration.toLowerCase()) {
            case "underline":
                return "underline";
            case "strikethrough":
                return "line-through";
            case "none":
                return "no-underline";
            default:
                return "";
        }
    }
    /**
     * Map text case to class
     */
    mapTextCase(textCase) {
        switch (textCase.toUpperCase()) {
            case "UPPER":
                return "uppercase";
            case "LOWER":
                return "lowercase";
            case "TITLE":
                return "capitalize";
            case "ORIGINAL":
            default:
                return "normal-case";
        }
    }
    /**
     * Map font family to class
     */
    mapFontFamily(fontFamily) {
        const name = fontFamily.toLowerCase();
        // Basic font family mapping
        if (name.includes("inter")) {
            return "font-sans";
        }
        if (name.includes("mono")) {
            return "font-mono";
        }
        if (name.includes("serif")) {
            return "font-serif";
        }
        // Default to sans
        return "font-sans";
    }
    /**
     * Infer appropriate HTML tag based on text style
     */
    inferTextTag(node) {
        if (!node.style) {
            return "p";
        }
        const { style } = node;
        const fontSize = style.fontSize || 16;
        const fontWeight = style.fontWeight || 400;
        // Heading inference
        if (fontSize >= 48) {
            return "h1";
        }
        if (fontSize >= 36) {
            return "h2";
        }
        if (fontSize >= 24) {
            return "h3";
        }
        if (fontSize >= 20) {
            return "h4";
        }
        // Button/bold text
        if (fontWeight >= 600) {
            // Could be a button - caller should check context
            return "span";
        }
        // Default
        return "p";
    }
    /**
     * Check if text looks like a heading
     */
    isHeading(node) {
        if (!node.style) {
            return false;
        }
        const fontSize = node.style.fontSize || 16;
        return fontSize >= 20;
    }
    /**
     * Check if text looks like a button
     */
    isButton(node) {
        if (!node.style) {
            return false;
        }
        const fontWeight = node.style.fontWeight || 400;
        return fontWeight >= 600;
    }
    /**
     * Get text content from a text node
     */
    getTextContent(node) {
        return node.characters || "";
    }
    /**
     * Check if text should be truncated (ellipsis)
     */
    shouldTruncate(node) {
        // Check for line truncation in Figma
        const lineCount = node.lineCount;
        const maxWidth = node.absoluteBoundingBox?.width || 0;
        // If there's a max width and limited lines, likely needs truncation
        return lineCount !== undefined && lineCount === 1 && maxWidth > 0;
    }
}
//# sourceMappingURL=typography.js.map