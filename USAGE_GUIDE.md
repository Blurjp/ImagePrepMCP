# Usage Guide: New Component Extraction Tools

## Quick Start

Your MCP server now has 4 tools instead of 1:

### 1. `process_figma_link` (EXISTING)
**What it does:** Exports Figma designs as images for visual analysis

**Example:**
```
User: "Show me this design: https://www.figma.com/design/dC3ifprl6oWlApLF1wzOFz/..."

Claude: [Calls process_figma_link]
Returns:
- Overview image (1728×1117px, 335KB WebP)
- 2 tiles for detailed analysis
- Manifest with metadata
```

---

### 2. `get_figma_components` (NEW!)
**What it does:** Extracts all components and component sets (variants) from a Figma file

**Example:**
```
User: "What components are in this design system?"

Claude: [Calls get_figma_components]
Returns:
## Component Sets (3)
### Button
Variants: Primary, Secondary, Disabled
Key: 27:2068

## Components (21)
### Button/Primary
Primary action button
Key: ad7e62d71449d00f09a985fee4fffbf88633e482

### Button/Secondary
Secondary action button
Key: 5b2c8f...
...
```

**When to use:**
- Understanding a design system
- Listing all reusable components
- Finding component variants
- Code generation from design system

---

### 3. `get_figma_node_details` (NEW!)
**What it does:** Gets detailed layout, styling, and properties for a specific node

**Requires:** URL with `node-id` parameter

**Example:**
```
User: "What are the exact spacing values for this frame?"
User provides: https://www.figma.com/design/FILE_KEY/...?node-id=1:1235

Claude: [Calls get_figma_node_details]
Returns:
# Node Details: Planet of Lana

Type: FRAME
ID: 1:1235

## Bounding Box
- Position: (0, 0)
- Size: 1728 × 1117

## Auto Layout
- Layout Mode: VERTICAL
- Primary Axis: AUTO
- Item Spacing: 16px
- Padding: 24px 24px 24px 24px

## Fills (1)
1. SOLID

## Effects (2)
1. DROP_SHADOW
2. INNER_SHADOW

## Children (8)
- Header (FRAME)
- Game Title (TEXT)
- Cover Image (RECTANGLE)
...
```

**When to use:**
- Getting exact spacing values
- Understanding auto-layout configuration
- Extracting fill/color values
- Finding shadow/effect values
- Analyzing node hierarchy

---

### 4. `get_figma_variables` (NEW!)
**What it does:** Extracts design variables (design tokens) from a Figma file

**Example:**
```
User: "What are the color tokens in this design system?"

Claude: [Calls get_figma_variables]
Returns:
# Design Variables

## Collections (2)
### Color Tokens
ID: VariableCollectionId:123
Modes: Light, Dark

### Spacing Tokens
ID: VariableCollectionId:456
Modes: Default

## Variables (15)

### COLOR (8)
**colors/primary**
Primary brand color
ID: VariableID:789
Values: {"mode1": {"r": 0.2, "g": 0.5, "b": 1, "a": 1}}

**colors/background**
Background color
ID: VariableID:790
Values: {"mode1": {"r": 0.1, "g": 0.1, "b": 0.1, "a": 1}}

### FLOAT (7)
**spacing/xs**
Extra small spacing
ID: VariableID:791
Values: {"mode1": 4}

**spacing/sm**
Small spacing
ID: VariableID:792
Values: {"mode1": 8}
...
```

**When to use:**
- Extracting design tokens
- Building CSS variables
- Understanding color system
- Getting spacing scale
- Multi-mode themes (light/dark)

---

## Real-World Workflows

### Workflow 1: "Build this design"

**User:** "Build this Figma design as a React component"

**Claude's thought process:**
1. Call `process_figma_link` → Get images for visual understanding
2. Call `get_figma_components` → See what reusable components exist
3. Call `get_figma_node_details` → Get exact spacing/layout values
4. Call `get_figma_variables` → Get design token values
5. Write React code using exact values

**Result:** Pixel-perfect implementation with correct design tokens

---

### Workflow 2: "Extract the design system"

**User:** "Document this design system"

**Claude's thought process:**
1. Call `get_figma_components` → List all components
2. Call `get_figma_variables` → Extract color/spacing tokens
3. For each major component:
   - Call `get_figma_node_details` with component node-id
   - Document properties
4. Call `process_figma_link` → Get visual examples
5. Generate markdown documentation

**Result:** Complete design system documentation with visuals

---

### Workflow 3: "Check spacing consistency"

**User:** "Are spacing values consistent across these frames?"

**Claude's thought process:**
1. Call `get_figma_variables` → Check if spacing tokens exist
2. For each frame:
   - Call `get_figma_node_details` with frame node-id
   - Extract padding and itemSpacing values
3. Compare values
4. Report inconsistencies

**Result:** Spacing audit with specific recommendations

---

### Workflow 4: "Generate CSS from design"

**User:** "Generate CSS custom properties from this design"

**Claude's thought process:**
1. Call `get_figma_variables` → Extract all design tokens
2. Convert to CSS format:
   ```css
   :root {
     --color-primary: #2d5a8c;
     --color-background: #1a1a2e;
     --spacing-xs: 4px;
     --spacing-sm: 8px;
     ...
   }
   ```
3. Call `get_figma_components` → Document which components use which tokens

**Result:** Production-ready CSS variables

---

## Tool Selection Guide

| User asks for... | Use this tool |
|------------------|---------------|
| "Show me the design" | `process_figma_link` |
| "What components exist?" | `get_figma_components` |
| "What's the spacing in this frame?" | `get_figma_node_details` |
| "What are the color tokens?" | `get_figma_variables` |
| "Build this design" | ALL 4 TOOLS! |
| "Document this design system" | ALL 4 TOOLS! |

---

## Getting Node IDs

To use `get_figma_node_details`, you need a node ID. Users can:

### Option 1: From Figma URL
Right-click any layer → Copy link to layer
```
https://www.figma.com/design/FILE_KEY/...?node-id=1:1235
                                        ↑ This is the node ID
```

### Option 2: From component list
1. Call `get_figma_components` first
2. Use the component key as node ID

### Option 3: Auto-select
If no node-id provided, `process_figma_link` auto-selects first frame and tells you the node ID

---

## Error Handling

### "No Figma token available"
**Cause:** User hasn't authenticated with Figma OAuth

**Solution:** Direct user to authenticate:
```
Visit: https://your-server.com/figma/authorize
```

### "Node ID is required"
**Cause:** Used `get_figma_node_details` without node-id in URL

**Solution:** Ask user for URL with node-id, or use `process_figma_link` first to get auto-selected node

### "No variables found in this file"
**Cause:** Figma file doesn't have any local variables defined

**Solution:** This is expected for files without design tokens. Not an error.

### "Rate limit exceeded"
**Cause:** Too many Figma API calls in short time

**Solution:** Wait 60 seconds and retry. This is Figma's rate limit, not yours.

---

## Pro Tips

### Tip 1: Combine tools for best results
Don't just use one tool! Combine them:
- Visual context (`process_figma_link`)
- Structure (`get_figma_components`, `get_figma_node_details`)
- Tokens (`get_figma_variables`)

### Tip 2: Cache component lists
If user asks about multiple components from same file:
1. Call `get_figma_components` ONCE
2. Reference the list multiple times
3. Only call `get_figma_node_details` for specific deep-dives

### Tip 3: Check for variables first
Before assuming hardcoded values:
1. Call `get_figma_variables`
2. If variables exist, use token names instead of hardcoded values
3. This makes code more maintainable

### Tip 4: Use node details for code generation
When generating CSS/HTML/React:
- `layoutMode: "VERTICAL"` → flexbox with `flex-direction: column`
- `itemSpacing: 16` → `gap: 16px`
- `paddingLeft: 24` → `padding-left: 24px`
- Use exact values, don't guess!

---

## Example Session

```
User: Build this design: https://www.figma.com/design/dC3ifprl6oWlApLF1wzOFz/...?node-id=1:1235

Claude: I'll analyze this Figma design and build it for you.

[Calls process_figma_link]
✅ Got overview image (1728×1117px)
✅ Visual context: Game launcher with dark theme, grid layout

[Calls get_figma_components]
✅ Found 21 components including Button/Primary, Card/Game, Header

[Calls get_figma_node_details for node 1:1235]
✅ Layout: VERTICAL auto-layout
✅ Spacing: 16px gap, 24px padding
✅ Background: SOLID fill

[Calls get_figma_variables]
✅ Found color tokens: primary, background, accent
✅ Found spacing tokens: xs, sm, md, lg

Now generating React component with exact values...

```tsx
import './tokens.css'; // CSS variables from design tokens

export function GameLauncher() {
  return (
    <div className="game-launcher">
      {/* Using exact spacing from Figma: padding: 24px, gap: 16px */}
      <Header />
      <GameGrid />
    </div>
  );
}
```

Done! The component matches your design exactly.
```

---

## Summary

You now have **4 powerful tools** that work together:

1. 🎨 **Visual** (`process_figma_link`) - See the design
2. 🧩 **Components** (`get_figma_components`) - List reusable parts
3. 📐 **Layout** (`get_figma_node_details`) - Get exact values
4. 🎨 **Tokens** (`get_figma_variables`) - Extract design system

This is **everything official Figma MCP does + image export**!
