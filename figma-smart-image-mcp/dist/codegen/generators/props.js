/**
 * Props Generator - extracts dynamic content and generates TypeScript interfaces
 */
import { sanitizeIdentifier } from "../utils/string.js";
/**
 * Generates component props from Figma nodes
 */
export class PropsGenerator {
    context;
    props = new Map();
    nextDefaultIndex = 1;
    constructor(context) {
        this.context = context;
    }
    /**
     * Extract props from a component tree
     */
    extractProps(node, elements) {
        this.props.clear();
        this.nextDefaultIndex = 1;
        this.traverseForProps(node, elements);
        // Always add children prop for slots
        if (this.hasSlotContent(node, elements)) {
            this.props.set("children", {
                name: "children",
                type: "React.ReactNode",
                isRequired: false,
            });
        }
        return Array.from(this.props.values()).sort((a, b) => a.name.localeCompare(b.name));
    }
    /**
     * Traverse node tree to find props
     */
    traverseForProps(node, elements, path = []) {
        const currentPath = [...path, node.name];
        // Check if this node should be a prop
        if (this.shouldBeProp(node)) {
            const propName = this.generatePropName(node, currentPath);
            const propDef = this.generatePropDefinition(node, propName);
            this.props.set(propName, propDef);
        }
        // Traverse children
        if (node.children) {
            for (const child of node.children) {
                const childElement = elements.get(child.id);
                if (childElement) {
                    // Recursively get full node details for children
                    this.traverseForProps(child, elements, currentPath);
                }
            }
        }
    }
    /**
     * Check if a node should be extracted as a prop
     */
    shouldBeProp(node) {
        // Text content with specific patterns
        if (node.type === "TEXT" && node.characters) {
            // Variable content like "Button", "Label", etc.
            const lowerName = node.name.toLowerCase();
            if (lowerName.includes("text") ||
                lowerName.includes("label") ||
                lowerName.includes("title") ||
                lowerName.includes("heading") ||
                lowerName.includes("button") ||
                lowerName.includes("content") ||
                lowerName.includes("description") ||
                lowerName.includes("caption")) {
                return true;
            }
            // Text with common placeholder patterns
            const content = node.characters.toLowerCase();
            if (content.includes("lorem ipsum") ||
                content.includes("click here") ||
                content.includes("enter text") ||
                content.includes("placeholder")) {
                return true;
            }
        }
        // Instances that might be slot content
        if (node.type === "INSTANCE") {
            const lowerName = node.name.toLowerCase();
            if (lowerName.includes("icon") ||
                lowerName.includes("slot") ||
                lowerName.includes("content") ||
                lowerName.includes("placeholder")) {
                return true;
            }
        }
        return false;
    }
    /**
     * Generate a prop name from node
     */
    generatePropName(node, path) {
        // Try to use the node name
        let name = sanitizeIdentifier(node.name).toLowerCase();
        // If name is too generic, use path
        const genericNames = ["text", "content", "layer", "frame"];
        if (genericNames.includes(name) || name.length === 0) {
            // Use parent context
            const parentName = path.length > 1 ? sanitizeIdentifier(path[path.length - 2]) : "";
            name = parentName + sanitizeIdentifier(node.name);
        }
        // Ensure uniqueness
        let finalName = name;
        let counter = 1;
        while (this.props.has(finalName)) {
            finalName = `${name}${counter}`;
            counter++;
        }
        return finalName;
    }
    /**
     * Generate prop definition from node
     */
    generatePropDefinition(node, name) {
        let type;
        let defaultValue;
        if (node.type === "TEXT") {
            type = "string";
            defaultValue = node.characters || `Text ${this.nextDefaultIndex++}`;
        }
        else if (node.type === "INSTANCE") {
            type = "React.ReactNode";
            defaultValue = undefined;
        }
        else {
            type = "React.ReactNode";
            defaultValue = undefined;
        }
        return {
            name,
            type,
            defaultValue,
            isRequired: defaultValue === undefined,
        };
    }
    /**
     * Check if component has slot content
     */
    hasSlotContent(node, elements) {
        if (!node.children) {
            return false;
        }
        // Check for instance children (likely slots)
        for (const child of node.children) {
            if (child.type === "INSTANCE") {
                return true;
            }
        }
        return false;
    }
    /**
     * Generate TypeScript interface for props
     */
    generateInterface(componentName, props, includeTypescript) {
        if (!includeTypescript || props.length === 0) {
            return null;
        }
        const interfaceName = `${componentName}Props`;
        const lines = [`export interface ${interfaceName} {`];
        for (const prop of props) {
            const optional = prop.isRequired ? "" : "?";
            const defaultComment = prop.defaultValue !== undefined ? ` // default: "${prop.defaultValue}"` : "";
            lines.push(`  ${prop.name}${optional}: ${prop.type};${defaultComment}`);
        }
        lines.push("}");
        return lines.join("\n");
    }
    /**
     * Generate props destructuring for component
     */
    generateDestructuring(props, interfaceName) {
        if (props.length === 0) {
            return "";
        }
        const propNames = props.map((p) => {
            const defaultValue = p.defaultValue !== undefined ? ` = ${JSON.stringify(p.defaultValue)}` : "";
            return `${p.name}${defaultValue}`;
        });
        const interfacePart = interfaceName ? `: ${interfaceName}` : "";
        return `{ ${propNames.join(", ")} }${interfacePart}`;
    }
    /**
     * Find prop by node ID
     */
    findPropByNodeId(nodeId, props) {
        // This would need metadata mapping - simplified for now
        return props.find((p) => p.name.toLowerCase().includes(nodeId.toLowerCase()));
    }
}
//# sourceMappingURL=props.js.map