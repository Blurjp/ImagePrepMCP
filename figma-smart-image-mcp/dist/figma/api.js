/**
 * Figma REST API client.
 * Handles file info retrieval and image export.
 */
import { request } from "undici";
export class FigmaApiError extends Error {
    statusCode;
    figmaCode;
    constructor(message, statusCode, figmaCode) {
        super(message);
        this.statusCode = statusCode;
        this.figmaCode = figmaCode;
        this.name = "FigmaApiError";
    }
}
export class FigmaApiClient {
    accessToken;
    requestTimeoutMs;
    baseUrl = "https://api.figma.com/v1";
    constructor(accessToken, requestTimeoutMs = 60000) {
        this.accessToken = accessToken;
        this.requestTimeoutMs = requestTimeoutMs;
    }
    async requestWithTimeout(url, options) {
        const controller = new AbortController();
        const timeoutMs = this.requestTimeoutMs;
        const timeoutId = timeoutMs > 0
            ? setTimeout(() => controller.abort(new Error("Figma API request timed out")), timeoutMs)
            : null;
        try {
            return await request(url, {
                ...options,
                signal: controller.signal,
            });
        }
        finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }
    }
    parseErrorBody(bodyText) {
        try {
            const parsed = JSON.parse(bodyText);
            if (parsed && typeof parsed === "object") {
                return {
                    err: typeof parsed.err === "string" ? parsed.err : undefined,
                    code: typeof parsed.code === "string" ? parsed.code : undefined,
                };
            }
        }
        catch {
            // ignore
        }
        return {};
    }
    /**
     * Get file information from Figma.
     */
    async getFileInfo(fileKey) {
        const url = `${this.baseUrl}/files/${fileKey}`;
        try {
            const response = await this.requestWithTimeout(url, {
                headers: {
                    "X-Figma-Token": this.accessToken,
                },
            });
            if (response.statusCode !== 200) {
                const body = await response.body.text();
                throw new FigmaApiError(body.err || `Failed to get file info (status ${response.statusCode})`, response.statusCode, body.code);
            }
            const data = await response.body.json();
            return data;
        }
        catch (error) {
            if (error instanceof FigmaApiError) {
                throw error;
            }
            throw new Error(`Failed to connect to Figma API: ${error}`);
        }
    }
    /**
     * Get current user info (token identity).
     */
    async getMe() {
        const url = `${this.baseUrl}/me`;
        try {
            const response = await this.requestWithTimeout(url, {
                headers: {
                    "X-Figma-Token": this.accessToken,
                },
            });
            if (response.statusCode !== 200) {
                const bodyText = await response.body.text();
                const body = this.parseErrorBody(bodyText);
                throw new FigmaApiError(body.err || `Failed to get user info (status ${response.statusCode})`, response.statusCode, body.code);
            }
            return await response.body.json();
        }
        catch (error) {
            if (error instanceof FigmaApiError) {
                throw error;
            }
            throw new Error(`Failed to get user info: ${error}`);
        }
    }
    /**
     * Check access to a file without loading full document.
     */
    async checkFileAccess(fileKey) {
        const url = `${this.baseUrl}/files/${fileKey}?depth=1`;
        try {
            const response = await this.requestWithTimeout(url, {
                headers: {
                    "X-Figma-Token": this.accessToken,
                },
            });
            if (response.statusCode === 200) {
                await response.body.text();
                return { statusCode: 200 };
            }
            const bodyText = await response.body.text();
            const body = this.parseErrorBody(bodyText);
            return {
                statusCode: response.statusCode,
                error: body.err || bodyText,
                code: body.code,
            };
        }
        catch (error) {
            return {
                statusCode: 0,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    /**
     * Get image export URL(s) for a specific node.
     */
    async getImageExportUrl(fileKey, nodeId, format) {
        const url = `${this.baseUrl}/images/${fileKey}?ids=${nodeId}&format=${format}&svg_outline_text=false`;
        try {
            const response = await this.requestWithTimeout(url, {
                headers: {
                    "X-Figma-Token": this.accessToken,
                },
            });
            if (response.statusCode !== 200) {
                const body = await response.body.text();
                throw new FigmaApiError(body.err || `Failed to get image export URL (status ${response.statusCode})`, response.statusCode, body.code);
            }
            const data = await response.body.json();
            if (!data.images || !data.images[nodeId]) {
                throw new Error(`No image URL returned for node ${nodeId}`);
            }
            const imageUrl = data.images[nodeId];
            // Figma returns empty string for unsupported formats
            if (!imageUrl || imageUrl === "") {
                throw new Error(`Format ${format} is not supported for this node`);
            }
            return imageUrl;
        }
        catch (error) {
            if (error instanceof FigmaApiError) {
                throw error;
            }
            if (error instanceof Error && error.message.includes("not supported")) {
                throw error;
            }
            throw new Error(`Failed to get image export URL: ${error}`);
        }
    }
    /**
     * Find the first suitable frame/node in the file.
     * Strategy: Get the first page, then find the first top-level frame.
     */
    async findFirstNode(fileKey) {
        const fileInfo = await this.getFileInfo(fileKey);
        // The document structure is: document -> children (pages) -> children (frames on page)
        if (!fileInfo.document || !fileInfo.document.children) {
            throw new Error("File has no pages");
        }
        const firstPage = fileInfo.document.children[0];
        if (!firstPage || !firstPage.children) {
            throw new Error("First page has no content");
        }
        // Prefer frames over other node types
        const frames = firstPage.children.filter((node) => node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE");
        if (frames.length > 0) {
            return {
                nodeId: frames[0].id,
                nodeName: frames[0].name,
            };
        }
        // Fallback to first node if no frames
        return {
            nodeId: firstPage.children[0].id,
            nodeName: firstPage.children[0].name,
        };
    }
    /**
     * Get node info from the file.
     */
    async getNodeInfo(fileKey, nodeId) {
        const url = `${this.baseUrl}/files/${fileKey}/nodes?ids=${nodeId}`;
        try {
            const response = await this.requestWithTimeout(url, {
                headers: {
                    "X-Figma-Token": this.accessToken,
                },
            });
            if (response.statusCode !== 200) {
                const body = await response.body.text();
                throw new FigmaApiError(body.err || `Failed to get node info (status ${response.statusCode})`, response.statusCode, body.code);
            }
            const data = await response.body.json();
            if (!data.nodes || !data.nodes[nodeId]) {
                throw new Error(`Node ${nodeId} not found`);
            }
            return data.nodes[nodeId].document;
        }
        catch (error) {
            if (error instanceof FigmaApiError) {
                throw error;
            }
            throw new Error(`Failed to get node info: ${error}`);
        }
    }
    /**
     * List top-level frames (depth=2) for quick node selection.
     */
    async listTopLevelFrames(fileKey) {
        const url = `${this.baseUrl}/files/${fileKey}?depth=2`;
        try {
            const response = await this.requestWithTimeout(url, {
                headers: {
                    "X-Figma-Token": this.accessToken,
                },
            });
            if (response.statusCode !== 200) {
                const body = await response.body.text();
                throw new FigmaApiError(body.err || `Failed to list frames (status ${response.statusCode})`, response.statusCode, body.code);
            }
            const data = await response.body.json();
            const doc = data?.document;
            if (!doc?.children) {
                return [];
            }
            const allowedTypes = new Set(["FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE", "SECTION"]);
            const results = [];
            for (const page of doc.children) {
                if (!page?.children)
                    continue;
                for (const node of page.children) {
                    if (allowedTypes.has(node.type)) {
                        results.push({
                            pageId: page.id,
                            pageName: page.name,
                            id: node.id,
                            name: node.name,
                            type: node.type,
                        });
                    }
                }
            }
            return results;
        }
        catch (error) {
            if (error instanceof FigmaApiError) {
                throw error;
            }
            throw new Error(`Failed to list frames: ${error}`);
        }
    }
    /**
     * Get all components from the file
     */
    async getComponents(fileKey) {
        const fileInfo = await this.getFileInfo(fileKey);
        const components = [];
        // Components are at top level in the response
        if (fileInfo.components) {
            for (const [key, comp] of Object.entries(fileInfo.components)) {
                components.push({
                    key: key,
                    name: comp.name,
                    description: comp.description || '',
                    componentSetId: comp.componentSetId,
                    documentationLinks: comp.documentationLinks || []
                });
            }
        }
        return components;
    }
    /**
     * Get component sets (variants) from the file
     */
    async getComponentSets(fileKey) {
        const fileInfo = await this.getFileInfo(fileKey);
        const componentSets = [];
        if (fileInfo.componentSets) {
            for (const [key, compSet] of Object.entries(fileInfo.componentSets)) {
                componentSets.push({
                    key: key,
                    name: compSet.name,
                    description: compSet.description || ''
                });
            }
        }
        return componentSets;
    }
    /**
     * Get detailed node properties including layout, fills, effects
     */
    async getNodeDetails(fileKey, nodeId) {
        const fileInfo = await this.getFileInfo(fileKey);
        // Traverse document tree to find the node
        const node = this.findNodeInTree(fileInfo.document, nodeId);
        if (!node) {
            throw new Error(`Node ${nodeId} not found in file`);
        }
        return {
            id: node.id,
            name: node.name,
            type: node.type,
            // Layout properties
            absoluteBoundingBox: node.absoluteBoundingBox,
            constraints: node.constraints,
            layoutMode: node.layoutMode,
            primaryAxisSizingMode: node.primaryAxisSizingMode,
            counterAxisSizingMode: node.counterAxisSizingMode,
            paddingLeft: node.paddingLeft,
            paddingRight: node.paddingRight,
            paddingTop: node.paddingTop,
            paddingBottom: node.paddingBottom,
            itemSpacing: node.itemSpacing,
            // Visual properties
            fills: node.fills || [],
            strokes: node.strokes || [],
            effects: node.effects || [],
            opacity: node.opacity,
            blendMode: node.blendMode,
            // Text properties (if text node)
            characters: node.characters,
            style: node.style,
            // Children (basic info only)
            children: node.children?.map((c) => ({
                id: c.id,
                name: c.name,
                type: c.type
            }))
        };
    }
    /**
     * Helper method to find a node in the document tree by ID
     */
    findNodeInTree(node, targetId) {
        if (node.id === targetId) {
            return node;
        }
        if (node.children) {
            for (const child of node.children) {
                const found = this.findNodeInTree(child, targetId);
                if (found)
                    return found;
            }
        }
        return null;
    }
    /**
     * Get local variables from the file
     * NOTE: This requires a different API endpoint than getFileInfo()
     */
    async getVariables(fileKey) {
        const url = `${this.baseUrl}/files/${fileKey}/variables/local`;
        try {
            const response = await this.requestWithTimeout(url, {
                headers: {
                    "X-Figma-Token": this.accessToken,
                },
            });
            if (response.statusCode !== 200) {
                const body = await response.body.text();
                throw new FigmaApiError(body.err || `Failed to get variables (status ${response.statusCode})`, response.statusCode, body.code);
            }
            const data = await response.body.json();
            return data;
        }
        catch (error) {
            if (error instanceof FigmaApiError) {
                throw error;
            }
            throw new Error(`Failed to get variables: ${error}`);
        }
    }
}
//# sourceMappingURL=api.js.map