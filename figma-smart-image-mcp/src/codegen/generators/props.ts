/**
 * Props Generator - extracts dynamic content and generates TypeScript interfaces
 */

import type { FigmaNodeDetails } from "../../figma/api.js";
import type { PropDefinition, JSXElement, BuildContext } from "../utils/types.js";
import { sanitizeIdentifier, toPascalCase } from "../utils/string.js";

/**
 * Generates component props from Figma nodes
 */
export class PropsGenerator {
  private props: Map<string, PropDefinition> = new Map();
  private nextDefaultIndex = 1;

  constructor(private context: BuildContext) {}

  /**
   * Extract props from a component tree
   */
  extractProps(node: FigmaNodeDetails, elements: Map<string, JSXElement>): PropDefinition[] {
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
  private traverseForProps(
    node: FigmaNodeDetails,
    elements: Map<string, JSXElement>,
    path: string[] = []
  ): void {
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
          this.traverseForProps(child as FigmaNodeDetails, elements, currentPath);
        }
      }
    }
  }

  /**
   * Check if a node should be extracted as a prop
   */
  private shouldBeProp(node: FigmaNodeDetails): boolean {
    // Text content with specific patterns
    if (node.type === "TEXT" && node.characters) {
      // Variable content like "Button", "Label", etc.
      const lowerName = node.name.toLowerCase();
      if (
        lowerName.includes("text") ||
        lowerName.includes("label") ||
        lowerName.includes("title") ||
        lowerName.includes("heading") ||
        lowerName.includes("button") ||
        lowerName.includes("content") ||
        lowerName.includes("description") ||
        lowerName.includes("caption")
      ) {
        return true;
      }

      // Text with common placeholder patterns
      const content = node.characters.toLowerCase();
      if (
        content.includes("lorem ipsum") ||
        content.includes("click here") ||
        content.includes("enter text") ||
        content.includes("placeholder")
      ) {
        return true;
      }
    }

    // Instances that might be slot content
    if (node.type === "INSTANCE") {
      const lowerName = node.name.toLowerCase();
      if (
        lowerName.includes("icon") ||
        lowerName.includes("slot") ||
        lowerName.includes("content") ||
        lowerName.includes("placeholder")
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate a prop name from node
   */
  private generatePropName(node: FigmaNodeDetails, path: string[]): string {
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
  private generatePropDefinition(node: FigmaNodeDetails, name: string): PropDefinition {
    let type: string;
    let defaultValue: string | number | boolean | undefined;

    if (node.type === "TEXT") {
      type = "string";
      defaultValue = node.characters || `Text ${this.nextDefaultIndex++}`;
    } else if (node.type === "INSTANCE") {
      type = "React.ReactNode";
      defaultValue = undefined;
    } else {
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
  private hasSlotContent(node: FigmaNodeDetails, elements: Map<string, JSXElement>): boolean {
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
  generateInterface(
    componentName: string,
    props: PropDefinition[],
    includeTypescript: boolean
  ): string | null {
    if (!includeTypescript || props.length === 0) {
      return null;
    }

    const interfaceName = `${componentName}Props`;

    const lines: string[] = [`export interface ${interfaceName} {`];

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
  generateDestructuring(props: PropDefinition[], interfaceName: string | null): string {
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
  findPropByNodeId(nodeId: string, props: PropDefinition[]): PropDefinition | undefined {
    // This would need metadata mapping - simplified for now
    return props.find((p) => p.name.toLowerCase().includes(nodeId.toLowerCase()));
  }
}
