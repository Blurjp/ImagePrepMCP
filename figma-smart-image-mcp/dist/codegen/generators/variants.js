/**
 * Variant Generator - handles component sets with variants/properties
 *
 * ENHANCED: Analyzes variant instances and maps their unique styles
 */
import { sanitizeIdentifier } from "../utils/string.js";
import { FigmaToTailwindMapper } from "../mappers/index.js";
/**
 * Generates variant props for component sets with style mapping
 */
export class VariantGenerator {
    context;
    constructor(context) {
        this.context = context;
    }
    /**
     * Check if a node is a component set (has variants)
     */
    isComponentSet(node) {
        return node.type === "COMPONENT_SET";
    }
    /**
     * Extract variant definition from a component set with style analysis
     */
    extractVariants(componentSetNode, getAllNodeDetails) {
        if (!this.isComponentSet(componentSetNode)) {
            return null;
        }
        // Get children (component instances with variant values)
        const children = componentSetNode.children || [];
        const instances = [];
        // Extract property names from the first child's name pattern
        // Figma formats: "PropertyName=Value, OtherProperty=Value"
        const propertiesMap = new Map();
        for (const child of children) {
            const parsed = this.parseVariantName(child.name);
            if (parsed) {
                // Get full node details for this instance to analyze styles
                const nodeDetails = getAllNodeDetails(child.id);
                const styles = nodeDetails ? this.extractVariantStyles(nodeDetails) : [];
                instances.push({
                    id: child.id,
                    name: child.name,
                    propertyValues: parsed,
                    styles,
                });
                // Collect all possible values for each property
                for (const [propName, propValue] of Object.entries(parsed)) {
                    if (!propertiesMap.has(propName)) {
                        propertiesMap.set(propName, new Set());
                    }
                    propertiesMap.get(propName).add(propValue);
                }
            }
        }
        if (propertiesMap.size === 0) {
            return null;
        }
        // Build variant properties
        const properties = [];
        for (const [propName, values] of propertiesMap.entries()) {
            const sortedValues = Array.from(values).sort();
            properties.push({
                name: propName,
                values: sortedValues,
                defaultValue: sortedValues[0], // First value is default
            });
        }
        // Analyze variant styles - what styles change between variants?
        const variantStyles = this.analyzeVariantStyles(instances, properties);
        return {
            componentSetName: componentSetNode.name,
            properties,
            instances,
            variantStyles,
        };
    }
    /**
     * Extract Tailwind classes from a node for variant comparison
     */
    extractVariantStyles(node) {
        const mapper = new FigmaToTailwindMapper(this.context);
        return mapper.mapNodeStyles(node);
    }
    /**
     * Analyze variant instances to find style differences
     * Returns a map of "propertyName=value" to unique Tailwind classes
     */
    analyzeVariantStyles(instances, properties) {
        const variantStyles = new Map();
        // Group instances by each property value
        for (const prop of properties) {
            const propName = prop.name;
            // Get all instances for each value of this property
            for (const value of prop.values) {
                // Find instances with this property value
                const matchingInstances = instances.filter((inst) => inst.propertyValues[propName] === value);
                if (matchingInstances.length > 0) {
                    // Find styles that are common to ALL instances with this variant value
                    // but different from instances with other values
                    const commonStyles = this.getCommonStylesForVariant(matchingInstances, instances, prop, value);
                    if (commonStyles.length > 0) {
                        const key = `${sanitizeIdentifier(propName)}=${value}`;
                        variantStyles.set(key, commonStyles.join(" "));
                    }
                }
            }
        }
        return variantStyles;
    }
    /**
     * Find styles that are common to all instances with a specific variant value
     * but different from instances with other values
     */
    getCommonStylesForVariant(matchingInstances, allInstances, property, value) {
        // Get styles that appear in ALL matching instances
        const styleCounts = new Map();
        const matchingCount = matchingInstances.length;
        for (const instance of matchingInstances) {
            for (const style of instance.styles) {
                styleCounts.set(style, (styleCounts.get(style) || 0) + 1);
            }
        }
        // Get styles that appear in ALL matching instances
        const commonStyles = new Set();
        for (const [style, count] of styleCounts.entries()) {
            if (count === matchingCount) {
                commonStyles.add(style);
            }
        }
        // Now filter out styles that also appear in instances with OTHER values
        // We only want styles UNIQUE to this variant value
        const otherInstances = allInstances.filter((inst) => inst.propertyValues[property.name] !== value);
        const uniqueStyles = [];
        for (const style of commonStyles) {
            // Check if this style appears in any instance with a different value
            const appearsInOther = otherInstances.some((inst) => inst.styles.includes(style));
            if (!appearsInOther) {
                uniqueStyles.push(style);
            }
        }
        return uniqueStyles;
    }
    /**
     * Parse Figma variant name format: "Property=Value, Other=Value"
     */
    parseVariantName(name) {
        // Remove component name prefix if present
        // Format is usually "ComponentName, Prop1=Value1, Prop2=Value2"
        const parts = name.split(", ").filter((p) => p.includes("="));
        if (parts.length === 0) {
            return null;
        }
        const result = {};
        for (const part of parts) {
            const [key, value] = part.split("=").map((s) => s.trim());
            if (key && value) {
                result[key] = value;
            }
        }
        return Object.keys(result).length > 0 ? result : null;
    }
    /**
     * Generate TypeScript interface for variant props
     */
    generateVariantInterface(componentName, variants, includeTypescript) {
        if (!includeTypescript || variants.properties.length === 0) {
            return null;
        }
        const interfaceName = `${componentName}Props`;
        const lines = [`export interface ${interfaceName} {`];
        for (const prop of variants.properties) {
            const propName = sanitizeIdentifier(prop.name);
            // Create union type from variant values
            const unionType = prop.values.map((v) => `"${v}"`).join(" | ");
            const defaultComment = prop.defaultValue ? ` // default: "${prop.defaultValue}"` : "";
            lines.push(`  ${propName}: ${unionType};${defaultComment}`);
        }
        // Always add children for slots
        lines.push(`  children?: React.ReactNode;`);
        lines.push("}");
        return lines.join("\n");
    }
    /**
     * Generate variant props destructuring with defaults
     */
    generateVariantDestructuring(variants, interfaceName) {
        if (variants.properties.length === 0) {
            return interfaceName ? `{}: ${interfaceName}` : "";
        }
        const props = variants.properties.map((prop) => {
            const propName = sanitizeIdentifier(prop.name);
            const defaultValue = prop.defaultValue ? ` = "${prop.defaultValue}"` : "";
            return `${propName}${defaultValue}`;
        });
        props.push("children");
        const destructuring = `{ ${props.join(", ")} }`;
        const typePart = interfaceName ? `: ${interfaceName}` : "";
        return `${destructuring}${typePart}`;
    }
    /**
     * Generate variant style mapping function
     */
    generateVariantStyleMapper(variants) {
        const lines = [];
        if (variants.variantStyles.size > 0) {
            lines.push(`// Variant styles mapping - classes that change per variant`);
            lines.push(`const getVariantClasses = (${variants.properties.map(p => sanitizeIdentifier(p.name)).join(", ")}: Record<string, string>) => {`);
            lines.push(`  const classes: string[] = [];`);
            for (const prop of variants.properties) {
                const propName = sanitizeIdentifier(prop.name);
                lines.push(`  if (${propName} !== undefined) {`);
                lines.push(`    switch (${propName}) {`);
                for (const value of prop.values) {
                    const key = `${propName}=${value}`;
                    const classes = variants.variantStyles.get(key);
                    if (classes) {
                        lines.push(`      case "${value}": classes.push("${classes}"); break;`);
                    }
                    else {
                        lines.push(`      case "${value}": break; // No unique styles for this variant`);
                    }
                }
                lines.push(`    }`);
                lines.push(`  }`);
            }
            lines.push(`  return classes;`);
            lines.push(`};`);
            lines.push(``);
            // Also generate a simpler object-based version
            lines.push(`// Alternative: Object-based style mapping`);
            lines.push(`const variantStyles: Record<string, string> = {`);
            for (const [key, classes] of variants.variantStyles.entries()) {
                lines.push(`  "${key}": "${classes}",`);
            }
            lines.push(`};`);
        }
        else {
            lines.push(`// No variant-specific styles found`);
            lines.push(`const getVariantClasses = () => [];`);
        }
        return lines.join("\n");
    }
    /**
     * Check if prop is a variant prop
     */
    isVariantProp(propName, variants) {
        if (!variants) {
            return false;
        }
        return variants.properties.some((p) => sanitizeIdentifier(p.name) === propName);
    }
    /**
     * Get variant styles map for external access
     */
    getVariantStyles(variants) {
        return variants.variantStyles;
    }
}
//# sourceMappingURL=variants.js.map