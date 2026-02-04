# React + Tailwind Export Feature Design Document

## Overview

Add the ability to export Figma designs as React components with Tailwind CSS classes (compatible with Twinwind/twin.macro) to the Figma Smart Image MCP Server.

## Goals

1. **Generate production-ready React components** from Figma designs
2. **Use Tailwind CSS utility classes** for styling (compatible with twin.macro)
3. **Support design tokens** (colors, spacing, typography) from Figma variables
4. **Handle component variants** (component sets with properties)
5. **Preserve layout fidelity** using Figma's Auto Layout → Flexbox/Grid mapping
6. **Optional TypeScript props** generation

## Non-Goals

- [ ] Pixel-perfect replication (some Figma features lack CSS equivalents)
- [ ] Interactive state handling (hover, focus, etc. - users add this)
- [ ] Responsive design (Figma has no responsive breakpoints)
- [ ] Complex animations (basic transitions only)
- [ ] Figma plugins or Dev Mode integration

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         MCP Tool Layer                          │
│  export_figma_to_react(url, component_name, options)           │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    React Code Generator                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              ComponentTreeTraverser                       │  │
│  │  - Recursively walks Figma node tree                      │  │
│  │  - Builds component hierarchy                             │  │
│  │  - Handles instances → component refs                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              JSXElementBuilder                            │  │
│  │  - Converts nodes to JSX elements                         │  │
│  │  - Maps FRAME → <div>, TEXT → <p>/<span>                 │  │
│  │  - Injects Tailwind classes                               │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              PropsGenerator                               │  │
│  │  - Extracts dynamic content as props                      │  │
│  │  - Generates TypeScript interfaces                        │  │
│  │  - Handles variant properties                             │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                  Tailwind Class Mapper                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           LayoutMapper (Auto Layout → Flexbox)           │  │
│  │  - layoutMode: HORIZONTAL → flex flex-row                 │  │
│  │  - layoutMode: VERTICAL → flex flex-col                   │  │
│  │  - itemSpacing → gap-{n}                                  │  │
│  │  - padding → p-{n} / px-{n} / pt-{n}, etc.               │  │
│  │  - primaryAxisSizingMode → flex-grow/shrink               │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           StyleMapper (fills, effects, text)             │  │
│  │  - fills → bg-{color} / bg-[hex]                          │  │
│  │  - strokes → border-{width} border-{color}                │  │
│  │  - effects (shadow) → shadow-{size}                       │  │
│  │  - opacity → opacity-{percentage}                         │  │
│  │  - borderRadius → rounded-{size}                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           TypographyMapper (text styles)                 │  │
│  │  - fontSize → text-{size} / text-[{px}]                  │  │
│  │  - fontWeight → font-{weight}                             │  │
│  │  - lineHeight → leading-{tight|normal|loose}              │  │
│  │  - letterSpacing → tracking-{tight|wide}                  │  │
│  │  - textAlign → text-{left|center|right}                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           ColorMapper (design tokens → Tailwind)         │  │
│  │  - Figma variables → CSS custom properties                │  │
│  │  - Named colors → Tailwind color palette                  │  │
│  │  - Arbitrary colors → bg-[hex]                            │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    Existing Figma API                           │
│  getNodeDetails(), getComponents(), getVariables(), etc.        │
└─────────────────────────────────────────────────────────────────┘
```

## API Design

### New MCP Tool: `export_figma_to_react`

```typescript
interface ExportFigmaToReactInput {
  url: string;                      // Figma URL with node-id
  component_name?: string;          // Output component name (default: from Figma)
  include_typescript?: boolean;     // Generate .tsx with props interface
  export_style?: "twin.macro" | "tw" | "classnames"; // CSS-in-JS style
  extract_design_tokens?: boolean;  // Export variables as CSS/Tailwind config
  include_children?: boolean;       // Include child components in output
  variant_property?: string;        // For component sets: which variant to export
}

interface ExportFigmaToReactOutput {
  component: {
    name: string;
    code: string;        // React component code
    language: string;    // "typescript" | "javascript"
  };
  design_tokens?: {
    tailwind_config?: Record<string, any>;  // tailwind.config.js extension
    css_variables?: string;                 // :root { ... }
  };
  dependencies?: string[];     // Required packages (twin.macro, etc.)
  exported_variants?: string[]; // List of variant component names
  metadata: {
    figma_node_id: string;
    figma_node_name: string;
    bounds: { width: number; height: number };
  };
}
```

### Example Tool Call

```json
{
  "url": "https://www.figma.com/design/abc123?node-id=1:123",
  "component_name": "HeroSection",
  "include_typescript": true,
  "export_style": "twin.macro",
  "extract_design_tokens": true
}
```

### Example Output

```tsx
// HeroSection.tsx
import { tw } from 'twin.macro'

export interface HeroSectionProps {
  title?: string
  description?: string
  ctaText?: string
}

export function HeroSection({
  title = "Build faster with Figma",
  description = "Export your designs to production-ready React components",
  ctaText = "Get Started"
}: HeroSectionProps) {
  return (
    <div tw="flex flex-col items-center px-12 py-16 bg-gradient-to-b from-slate-900 to-slate-800 min-h-[600px]">
      <h1 tw="text-6xl font-bold text-white text-center mb-6">
        {title}
      </h1>
      <p tw="text-xl text-slate-300 text-center max-w-2xl mb-8">
        {description}
      </p>
      <button tw="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-lg">
        {ctaText}
      </button>
    </div>
  )
}
```

## File Structure

```
figma-smart-image-mcp/src/
├── codegen/
│   ├── index.ts                    # Main entry point
│   ├── generators/
│   │   ├── component.ts            # ReactComponentGenerator
│   │   ├── props.ts                # PropsGenerator
│   │   ├── jsx.ts                  # JSXElementBuilder
│   │   └── design-tokens.ts        # DesignTokenExtractor
│   ├── mappers/
│   │   ├── index.ts                # Mapper orchestration
│   │   ├── layout.ts               # Auto Layout → Flexbox
│   │   ├── style.ts                # Fills, strokes, effects
│   │   ├── typography.ts           # Font styles
│   │   ├── color.ts                # Color → Tailwind
│   │   └── spacing.ts              # Pixel → Tailwind spacing
│   ├── traverser/
│   │   ├── tree.ts                 # ComponentTreeTraverser
│   │   ├── handlers/
│   │   │   ├── frame.ts            # FRAME/COMPONENT handler
│   │   │   ├── text.ts             # TEXT handler
│   │   │   ├── instance.ts         # INSTANCE handler
│   │   │   └── vector.ts           # VECTOR/BOOLEAN handler
│   └── utils/
│       ├── string.ts               # Name sanitization, etc.
│       ├── color.ts                # Color conversion utilities
│       └── types.ts                # Shared types
```

## Implementation Details

### 1. Layout Mapper

```typescript
// mappers/layout.ts
export class LayoutMapper {
  mapAutoLayout(node: FigmaNodeDetails): string[] {
    const classes: string[] = [];

    // Layout mode
    if (node.layoutMode === "HORIZONTAL") {
      classes.push("flex", "flex-row");
    } else if (node.layoutMode === "VERTICAL") {
      classes.push("flex", "flex-col");
    }

    // Item spacing (gap)
    if (node.itemSpacing !== undefined && node.itemSpacing > 0) {
      classes.push(this.mapSpacing(node.itemSpacing, "gap"));
    }

    // Padding
    const padding = this.getUniformPadding(node);
    if (padding) {
      classes.push(this.mapSpacing(padding, "p"));
    } else {
      // Non-uniform padding
      if (node.paddingTop) classes.push(this.mapSpacing(node.paddingTop, "pt"));
      if (node.paddingBottom) classes.push(this.mapSpacing(node.paddingBottom, "pb"));
      if (node.paddingLeft) classes.push(this.mapSpacing(node.paddingLeft, "pl"));
      if (node.paddingRight) classes.push(this.mapSpacing(node.paddingRight, "pr"));
    }

    // Alignment
    classes.push(...this.mapAlignment(node));

    // Sizing mode
    if (node.primaryAxisSizingMode === "FILL") {
      classes.push("flex-1");
    }
    if (node.counterAxisSizingMode === "FILL") {
      classes.push(node.layoutMode === "VERTICAL" ? "w-full" : "h-full");
    }

    return classes;
  }

  private mapSpacing(pixels: number, prefix: string): string {
    // Map to Tailwind's scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96
    const scale = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96];
    const closest = scale.find((v, i) => {
      const next = scale[i + 1] ?? Infinity;
      return pixels >= v && pixels < (v + next) / 2;
    }) ?? Math.round(pixels / 4) * 4;

    const scaleIndex = scale.indexOf(closest);
    if (scaleIndex >= 0) {
      return `${prefix}-${scaleIndex}`; // e.g., "p-4", "gap-6"
    }
    // Arbitrary value
    return `${prefix}-[${pixels}]`;
  }

  private mapAlignment(node: FigmaNodeDetails): string[] {
    // Maps primaryAxisAlignItems, counterAxisAlignItems, etc.
    // to justify-start/end/center, items-start/end/center
    // ...
  }
}
```

### 2. Color Mapper

```typescript
// mappers/color.ts
export class ColorMapper {
  // Figma variables → CSS custom properties
  mapVariable(variable: FigmaVariable, prefix: string): string {
    return `--${prefix}-${this.kebabCase(variable.name)}: ${this.toRgb(variable.value)};`;
  }

  // Fill color → Tailwind class
  mapFill(fill: any, designTokens: Map<string, string>): string {
    if (fill.type === "SOLID") {
      const hex = this.rgbaToHex(fill.color, fill.opacity);
      const tokenName = this.findMatchingToken(hex, designTokens);
      if (tokenName) {
        return `bg-${tokenName}`;
      }
      return `bg-[${hex}]`;
    }
    // Handle GRADIENT_LINEAR, GRADIENT_RADIAL
    return "";
  }

  private rgbaToHex(color: { r: number; g: number; b: number }, opacity?: number): string {
    const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
    const alpha = opacity !== undefined ? Math.round(opacity * 255).toString(16).padStart(2, "0") : "";
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}${alpha}`;
  }
}
```

### 3. JSX Element Builder

```typescript
// generators/jsx.ts
export class JSXElementBuilder {
  buildElement(node: FigmaNodeDetails, context: BuildContext): JSXElement {
    const tag = this.mapNodeTypeToTag(node.type, node);
    const classes = this.mapStylesToClasses(node, context);
    const children = this.buildChildren(node, context);
    const props = this.extractProps(node, context);

    return {
      tag,
      props: {
        ...props,
        // CSS classes based on export style
        ...(this.exportStyle === "twin.macro"
          ? { tw: this.classesToTwinMacro(classes) }
          : { className: classes.join(" ") }),
      },
      children,
      isSelfClosing: children.length === 0,
    };
  }

  private mapNodeTypeToTag(type: string, node: FigmaNodeDetails): string {
    switch (type) {
      case "FRAME":
      case "COMPONENT":
      case "INSTANCE":
        return "div";
      case "TEXT":
        return this.inferTextTag(node);
      case "DOCUMENT":
      case "PAGE":
        return "div"; // Fragment or empty div
      case "SECTION":
        return "section";
      case "VECTOR":
      case "BOOLEAN_OPERATION":
        return "svg"; // Or as background image
      default:
        return "div";
    }
  }

  private inferTextTag(node: FigmaNodeDetails): string {
    // Infer semantic tag based on font size/style
    const fontSize = node.style?.fontSize || 16;
    const fontWeight = node.style?.fontWeight || 400;

    if (fontSize >= 48) return "h1";
    if (fontSize >= 36) return "h2";
    if (fontSize >= 24) return "h3";
    if (fontWeight >= 600) return "strong"; // Or button
    return "p";
  }
}
```

### 4. Component Generator

```typescript
// generators/component.ts
export class ReactComponentGenerator {
  async generate(input: ExportInput): Promise<ExportOutput> {
    // 1. Fetch Figma data
    const parsed = FigmaLinkParser.parse(input.url);
    const api = new FigmaApiClient(this.token);
    const nodeDetails = await api.getNodeDetails(parsed.fileKey, parsed.nodeId);

    // 2. Extract design tokens if requested
    let designTokens;
    if (input.extract_design_tokens) {
      const variables = await api.getVariables(parsed.fileKey);
      designTokens = this.extractDesignTokens(variables);
    }

    // 3. Traverse and build component tree
    const traverser = new ComponentTreeTraverser(api, designTokens);
    const componentTree = await traverser.traverse(parsed.fileKey, parsed.nodeId);

    // 4. Generate React code
    const componentName = input.component_name || this.sanitizeName(nodeDetails.name);
    const props = this.generatePropsInterface(componentTree, input.include_typescript);
    const jsx = this.buildJSX(componentTree, input.export_style);

    const code = this.format(`
      ${input.include_typescript ? this.generateImports(props, input.export_style) : ""}
      ${props}

      export function ${componentName}${props ? `<${this.extractPropName(props)}>` : ""} {
        return (
          ${jsx}
        )
      }
    `);

    return {
      component: { name: componentName, code, language: input.include_typescript ? "typescript" : "javascript" },
      design_tokens: designTokens?.toTailwindFormat(),
      dependencies: this.getDependencies(input.export_style),
      metadata: { /* ... */ },
    };
  }
}
```

## Design Token Integration

### Figma Variables → Tailwind Config

```typescript
// Figma variable: { name: "primary/base", value: { r: 0.2, g: 0.5, b: 1.0 } }
// → tailwind.config.js:
{
  theme: {
    extend: {
      colors: {
        primary: {
          base: "rgba(51, 128, 255, 1)",
          light: "rgba(102, 178, 255, 1)",
          dark: "rgba(25, 76, 153, 1)",
        }
      }
    }
  }
}
```

### CSS Custom Properties (Alternative)

```css
:root {
  --color-primary-base: rgb(51, 128, 255);
  --color-primary-light: rgb(102, 178, 255);
  --spacing-unit: 8px;
}
```

## Variant Support (Component Sets)

Figma component sets with properties become React components with props:

```typescript
// Figma component set: Button with properties { size: [sm, md, lg], variant: [primary, secondary] }

// Generated React:
export interface ButtonProps {
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary";
  children: React.ReactNode;
}

export function Button({ size = "md", variant = "primary", children }: ButtonProps) {
  const baseClasses = "px-4 py-2 rounded font-semibold";
  const sizeClasses = { sm: "text-sm px-3 py-1", md: "px-4 py-2", lg: "text-lg px-6 py-3" };
  const variantClasses = {
    primary: "bg-blue-600 text-white",
    secondary: "bg-slate-200 text-slate-900"
  };

  return (
    <button className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]}`}>
      {children}
    </button>
  );
}
```

## Edge Cases and Known Limitations

| Figma Feature | CSS Equivalent | Handling |
|---|---|---|
| Absolute positioning | `position: absolute` | Generate with `[style]` |
| Masks | `clip-path` or wrapper | Complex, may skip |
| Boolean operations | SVG path | Export as SVG |
| Blend modes | `mix-blend-mode` | Limited browser support |
| Grid layout (experimental) | `display: grid` | Map to CSS Grid |
| Constraints | `flex-grow`/`align-self` | Partial mapping |
| Rotations | `transform: rotate()` | Include in `style` |
| Corner radius per corner | `border-radius` | Use individual sides |
| Multiple strokes | Limited CSS | Use `box-shadow` hacks |
| 3D transforms | `transform: preserve-3d` | Experimental |

## Phased Implementation

### Phase 1: MVP (Foundation)
**Goal**: Export simple frames as basic React components with Tailwind classes

**Tasks**:
1. Create `codegen/` directory structure
2. Implement `LayoutMapper` (Auto Layout → flex)
3. Implement basic `ColorMapper` (solid fills → bg-{color})
4. Implement `JSXElementBuilder` (FRAME → div, TEXT → p)
5. Create `export_figma_to_react` tool
6. Add unit tests for mappers
7. Document in README

**Deliverable**: Can export a simple Hero section with background color, centered text, and a button.

### Phase 2: Design System Integration
**Goal**: Support design tokens and component variants

**Tasks**:
1. Implement `DesignTokenExtractor` (Figma variables → CSS/Tailwind)
2. Add `extract_design_tokens` option
3. Generate `tailwind.config.js` extension
4. Implement component set → variant props mapping
5. Add proper TypeScript prop generation
6. Support for text style mapping

**Deliverable**: Can export a Button component with size/variant props backed by design tokens.

### Phase 3: Advanced Features
**Goal**: Handle edge cases and improve output quality

**Tasks**:
1. Absolute positioning support
2. SVG/icon export (VECTOR nodes)
3. Gradient fills
4. Effects (shadows, blurs)
5. Image export (IMAGE nodes)
6. Corner radius per corner
7. Grid layout support
8. Export multiple components at once

**Deliverable**: Production-ready component export for complex designs.

### Phase 4: Polish
**Goal**: Developer experience and optimization

**Tasks**:
1. Code formatting (Prettier integration)
2. Better error messages
3. Progress indication for large files
4. CLI option for bulk export
5. Documentation and examples
6. Performance optimization

**Deliverable**: Fully-featured, well-documented export system.

## Testing Strategy

```typescript
// tests/codegen/layout-mapper.test.ts
describe("LayoutMapper", () => {
  it("maps horizontal auto layout to flex flex-row", () => {
    const node = mockFigmaNode({ layoutMode: "HORIZONTAL" });
    const mapper = new LayoutMapper();
    const classes = mapper.mapAutoLayout(node);
    expect(classes).toContain("flex");
    expect(classes).toContain("flex-row");
  });

  it("maps 16px padding to p-4", () => {
    const node = mockFigmaNode({ paddingLeft: 16, paddingRight: 16, paddingTop: 16, paddingBottom: 16 });
    const mapper = new LayoutMapper();
    const classes = mapper.mapAutoLayout(node);
    expect(classes).toContain("p-4");
  });

  it("uses arbitrary values for non-standard spacing", () => {
    const node = mockFigmaNode({ itemSpacing: 18 });
    const mapper = new LayoutMapper();
    const classes = mapper.mapAutoLayout(node);
    expect(classes).toContain("gap-[18px]");
  });
});
```

## Dependencies

**New runtime dependencies**:
- None (code generation is pure TypeScript)

**New dev dependencies**:
- `@types/node` (already present)
- Optional: `prettier` for code formatting

**User-facing dependencies** (generated code may require):
- `twin.macro` (if using twin.macro style)
- `tailwindcss` (always)
- `@emotion/react` (if using twin.macro with emotion)

## Configuration

Add to `.env` or environment:

```bash
# Optional: Default export style
REACT_EXPORT_DEFAULT_STYLE=twin.macro

# Optional: Include TypeScript by default
REACT_EXPORT_DEFAULT_TYPESCRIPT=true
```

## Performance Considerations

- **Large files**: Use depth-limited traversal, implement pagination
- **Caching**: Cache Figma API responses in Redis
- **Timeout**: Use existing timeout infrastructure (`MCP_TOOL_TIMEOUT_MS`)
- **Streaming**: For multi-component export, stream results

## Security Considerations

- Existing OAuth/auth infrastructure is sufficient
- No new attack vectors (read-only Figma access)
- Generated code should be reviewed by users (no auto-execution)

## Documentation

Add to README.md:

```markdown
## React + Tailwind Export

Export Figma designs as React components with Tailwind CSS classes.

### Example

\`\`\`typescript
// Ask Claude to export a Figma design
const result = await export_figma_to_react({
  url: "https://www.figma.com/design/abc?node-id=1:123",
  component_name: "HeroSection",
  include_typescript: true,
  export_style: "twin.macro"
});

console.log(result.component.code);
\`\`\`

### Features

- Auto Layout → Flexbox
- Design tokens → Tailwind config
- Component variants → Props
- TypeScript support
\`\`\`
```

## Open Questions

1. **How to handle images?** Export as separate files or base64?
2. **How to handle icons?** Inline SVG, sprite sheet, or component library?
3. **How to handle responsive design?** Generate multiple variants or use Tailwind breakpoints?
4. **Should we generate storybook stories?** Optional add-on?
5. **How to handle state (hover, focus, active)?** Parse from prototype interactions or manual?
