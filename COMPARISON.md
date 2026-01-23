# Visual Comparison: Your Approach vs Official Figma MCP

## What Data is Available

When you call `GET /v1/files/{fileKey}`, Figma returns this JSON structure:

```json
{
  "name": "Design Application Game Launcher",
  "lastModified": "2026-01-13T05:11:52Z",
  "thumbnailUrl": "https://...",
  "version": "123",
  "schemaVersion": 0,

  "document": {
    "id": "0:0",
    "name": "Document",
    "type": "DOCUMENT",
    "children": [
      {
        "id": "0:1",
        "name": "Page 1",
        "type": "CANVAS",
        "children": [
          {
            "id": "1:1235",
            "name": "Planet of Lana",
            "type": "FRAME",
            "absoluteBoundingBox": { "x": 0, "y": 0, "width": 1728, "height": 1117 },
            "backgroundColor": { "r": 0.1, "g": 0.1, "b": 0.1, "a": 1 },
            "fills": [...],
            "effects": [...],
            "constraints": {...},
            "layoutMode": "VERTICAL",  // ← AUTO-LAYOUT DATA
            "itemSpacing": 16,
            "paddingLeft": 24,
            "children": [...]
          }
        ]
      }
    ]
  },

  "components": {
    "ad7e62d71449d00f09a985fee4fffbf88633e482": {
      "key": "ad7e62d71449d00f09a985fee4fffbf88633e482",
      "name": "Button/Primary",
      "description": "Primary action button",
      "componentSetId": "27:2068",
      "documentationLinks": []
    }
    // ... 20 more components
  },

  "componentSets": {
    "27:2068": {
      "key": "27:2068",
      "name": "Button",
      "description": "Button component with variants"
    }
  },

  "styles": {
    "S:abc123": {
      "key": "S:abc123",
      "name": "Heading/H1",
      "styleType": "TEXT",
      "description": "Primary heading style"
    }
  }
}
```

---

## What You Currently Do With This Data

```typescript
// src/figma/api.ts line 136
const fileInfo = await this.getFileInfo(fileKey);  // ← Gets ALL the JSON above

// You only extract this:
const firstPage = fileInfo.document.children[0];  // ← Page 1
const firstFrame = firstPage.children[0];         // ← Planet of Lana frame

return {
  nodeId: firstFrame.id,      // "1:1235"
  nodeName: firstFrame.name   // "Planet of Lana"
};

// Then you throw away:
// ❌ fileInfo.components (21 components!)
// ❌ fileInfo.componentSets (3 component sets!)
// ❌ fileInfo.styles (text/color styles)
// ❌ firstFrame.backgroundColor
// ❌ firstFrame.fills
// ❌ firstFrame.effects
// ❌ firstFrame.constraints
// ❌ firstFrame.layoutMode (auto-layout info!)
// ❌ firstFrame.itemSpacing
// ❌ firstFrame.paddingLeft, paddingRight, etc.
// ❌ All node properties for code generation
```

---

## What Official Figma MCP Does

```typescript
// Extracts components
const components = fileInfo.components;  // ← All 21 components
const componentSets = fileInfo.componentSets;  // ← Variant groups

// Extracts detailed node properties
const node = findNodeById(fileInfo.document, nodeId);
const layoutData = {
  layoutMode: node.layoutMode,           // "VERTICAL"
  itemSpacing: node.itemSpacing,         // 16
  paddingLeft: node.paddingLeft,         // 24
  constraints: node.constraints,         // How it resizes
  fills: node.fills,                     // Colors/gradients
  effects: node.effects                  // Shadows/blurs
};

// Makes ADDITIONAL API call for variables
const variables = await fetch(`/v1/files/${fileKey}/variables/local`);
// Returns:
// {
//   meta: {
//     variables: {
//       "VariableID:123": {
//         name: "colors/primary",
//         resolvedType: "COLOR",
//         valuesByMode: { "mode1": { r: 0.2, g: 0.5, b: 1 } }
//       }
//     }
//   }
// }
```

---

## Side-by-Side Comparison

| Data Type | Available in `getFileInfo()` | Your Code Uses | Official MCP Uses |
|-----------|------------------------------|----------------|-------------------|
| Components | ✅ Yes | ❌ No | ✅ Yes |
| Component Sets | ✅ Yes | ❌ No | ✅ Yes |
| Styles | ✅ Yes | ❌ No | ✅ Yes |
| Layout Mode (Auto-layout) | ✅ Yes | ❌ No | ✅ Yes |
| Padding/Spacing | ✅ Yes | ❌ No | ✅ Yes |
| Fills (Colors) | ✅ Yes | ❌ No | ✅ Yes |
| Effects (Shadows) | ✅ Yes | ❌ No | ✅ Yes |
| Constraints | ✅ Yes | ❌ No | ✅ Yes |
| Node Hierarchy | ✅ Yes | ❌ No | ✅ Yes |
| **Variables** | ⚠️ Separate API | ❌ No | ✅ Yes |
| **Images (rendered)** | ⚠️ Separate API | ✅ Yes | ❌ No |

---

## The Solution: Do BOTH!

```typescript
// Your existing tool (keep it!)
tools: [
  {
    name: "process_figma_link",
    description: "Export Figma design as images for visual analysis"
    // Returns: Overview image + tiles for Claude to "see"
  },

  // NEW TOOLS (add these!)
  {
    name: "get_figma_components",
    description: "Get component definitions for code generation"
    // Returns: Components, component sets from fileInfo.components
  },

  {
    name: "get_figma_layout",
    description: "Get layout properties (auto-layout, spacing, constraints)"
    // Returns: Layout data from fileInfo.document traversal
  },

  {
    name: "get_figma_variables",
    description: "Get design variables (colors, spacing tokens)"
    // Returns: Variables from new API call to /variables/local
  }
]
```

---

## Real-World Usage Example

### Current (Image-only):
```
User: "Build this Figma design"
Claude: [Uses process_figma_link]
        [Gets images, analyzes visually]
        [Describes what it sees]
        [Writes code based on visual interpretation]
        ❌ Guesses colors: "looks like #1a1a1a"
        ❌ Guesses spacing: "maybe 16px?"
        ❌ Guesses component structure
```

### With Component Data:
```
User: "Build this Figma design"
Claude: [Uses process_figma_link] → Gets images
        [Uses get_figma_components] → Gets Button/Primary component
        [Uses get_figma_layout] → Gets exact spacing: 16px, padding: 24px
        [Uses get_figma_variables] → Gets exact color: #1a1a2e
        ✅ Writes code with exact values
        ✅ Reuses design system components
        ✅ Maintains consistency
```

---

## Bottom Line

**You're 90% there!** You just need to:

1. Stop throwing away `fileInfo.components` (3 lines of code)
2. Stop throwing away `fileInfo.styles` (3 lines of code)
3. Extract node properties instead of just id/name (10 lines of code)
4. Add ONE new API call for variables (20 lines of code)
5. Create 3 new MCP tools to expose this data (50 lines of code)

**Total**: ~86 lines of code to match official Figma MCP functionality!

**And you keep your image export** which official MCP doesn't have!
