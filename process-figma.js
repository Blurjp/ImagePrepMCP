// Process Figma design locally
import { FigmaLinkParser } from './figma-smart-image-mcp/dist/figma/parse_link.js';
import { FigmaApiClient } from './figma-smart-image-mcp/dist/figma/api.js';
import { FigmaExporter } from './figma-smart-image-mcp/dist/figma/export.js';
import { ImageEncoder } from './figma-smart-image-mcp/dist/image/encode.js';
import { ImageTiler } from './figma-smart-image-mcp/dist/image/tiles.js';
import { generateOutputDir, writeManifest, getDisplayPath, formatBytes } from './figma-smart-image-mcp/dist/util/fs.js';

const token = process.env.FIGMA_TOKEN;
const url = 'https://www.figma.com/design/dC3ifprl6oWlApLF1wzOFz/Design-Application-Game-Launcher-or-Game-Store--Community-';

if (!token) {
  console.log('ERROR: FIGMA_TOKEN not set');
  process.exit(1);
}

async function processFigma() {
  try {
    console.log('Parsing Figma URL...');
    const parsed = FigmaLinkParser.parse(url);
    console.log('File key:', parsed.fileKey);

    const outputDir = generateOutputDir();
    console.log('Output directory:', getDisplayPath(outputDir));

    const api = new FigmaApiClient(token);
    const exporter = new FigmaExporter(api);
    const encoder = new ImageEncoder();
    const tiler = new ImageTiler(encoder);

    // Find first node
    console.log('\nFinding node to export...');
    const selection = await api.findFirstNode(parsed.fileKey);
    const nodeId = selection.nodeId;
    const nodeName = selection.nodeName;
    console.log('Selected node:', nodeName);

    // Export image as PNG (not SVG to avoid size issues)
    console.log('\nExporting from Figma as PNG...');
    const exportedImage = await exporter.exportAndDownload(
      parsed.fileKey,
      nodeId,
      outputDir,
      'png'
    );
    console.log('Exported:', getDisplayPath(exportedImage.path));

    // Convert SVG if needed
    let sourceForProcessing = exportedImage.path;
    if (exportedImage.format === 'svg') {
      console.log('\nConverting SVG to PNG...');
      const pngPath = exportedImage.path.replace(/\.svg$/, '.png');
      await encoder.convertSvgToPng(exportedImage.path, pngPath, 2);
      sourceForProcessing = pngPath;
    }

    // Generate overview
    console.log('\nGenerating overview image...');
    const overviewPath = sourceForProcessing.replace(
      /\.(png|jpg|jpeg|webp)$/,
      '_overview.webp'
    );
    const overview = await encoder.encodeToFit(sourceForProcessing, overviewPath, {
      maxBytes: 4000000,
      maxLongEdge: 4096,
      preferFormat: 'webp',
    });
    console.log('Overview:', getDisplayPath(overview.path));
    console.log('  Size:', `${overview.width}x${overview.height}`);
    console.log('  Bytes:', formatBytes(overview.bytes));

    // Generate tiles
    console.log('\nGenerating tiles...');
    const tilesDir = outputDir + '/tiles';
    const tiles = await tiler.generateTiles(sourceForProcessing, tilesDir, {
      tilePx: 1536,
      overlapPx: 96,
      maxBytes: 4000000,
      maxLongEdge: 4096,
      preferFormat: 'webp',
    });
    console.log(`Generated ${tiles.length} tiles`);

    // Write manifest
    const manifestPath = outputDir + '/manifest.json';
    await writeManifest(manifestPath, {
      version: '1.0.0',
      timestamp: Date.now(),
      selected: {
        fileKey: parsed.fileKey,
        nodeId: nodeId,
        sourceFormatUsed: exportedImage.format,
        originalPath: exportedImage.path,
      },
      overview: {
        path: overview.path,
        bytes: overview.bytes,
        width: overview.width,
        height: overview.height,
        format: overview.format,
        quality: overview.quality,
        scaleFactor: overview.scaleFactor,
      },
      tiles: tiles.map((t) => ({
        path: t.path,
        x: t.x,
        y: t.y,
        w: t.w,
        h: t.h,
        bytes: t.bytes,
        width: t.width,
        height: t.height,
      })),
    });

    console.log('\n✅ SUCCESS!');
    console.log('\nOutput directory:', getDisplayPath(outputDir));
    console.log('Manifest:', getDisplayPath(manifestPath));
    console.log('\nImages generated:');
    console.log('  - Overview:', getDisplayPath(overview.path));
    console.log(`  - ${tiles.length} tiles in:`, getDisplayPath(tilesDir));
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    process.exit(1);
  }
}

processFigma();
