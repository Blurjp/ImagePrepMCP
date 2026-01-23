// Test script to see what data Figma Files API returns
import { readFileSync } from 'fs';
import { homedir } from 'os';

const token = process.env.FIGMA_TOKEN || readFileSync(homedir() + '/.figma-smart-image-mcp/token', 'utf8').trim();
const fileKey = 'dC3ifprl6oWlApLF1wzOFz';

console.log('Fetching full file structure...\n');

fetch(`https://api.figma.com/v1/files/${fileKey}`, {
  headers: { 'X-Figma-Token': token }
})
.then(r => r.json())
.then(data => {
  if (data.err || data.status >= 400) {
    console.error('Figma API Error:', data);
    process.exit(1);
  }

  console.log('=== RESPONSE TOP-LEVEL KEYS ===');
  console.log(Object.keys(data).join(', '));
  console.log('\n=== WHAT YOUR CODE CURRENTLY IGNORES ===\n');

  // 1. Components
  if (data.components) {
    console.log('✅ COMPONENTS:', Object.keys(data.components).length, 'components available');
    const firstComp = Object.values(data.components)[0];
    console.log('   Example component:', firstComp.name);
    console.log('   Component data:', JSON.stringify(firstComp, null, 2).slice(0, 300));
  }

  // 2. Component Sets
  if (data.componentSets) {
    console.log('\n✅ COMPONENT SETS:', Object.keys(data.componentSets).length);
  }

  // 3. Styles
  if (data.styles && Object.keys(data.styles).length > 0) {
    console.log('\n✅ STYLES:', Object.keys(data.styles).length, 'styles defined');
    const firstStyle = Object.values(data.styles)[0];
    if (firstStyle) {
      console.log('   Example:', firstStyle.name, '-', firstStyle.styleType);
    }
  } else {
    console.log('\n⚠️  STYLES: None defined in this file');
  }

  // 4. Schema version
  console.log('\n✅ SCHEMA VERSION:', data.schemaVersion);
  console.log('✅ LAST MODIFIED:', data.lastModified);
  console.log('✅ THUMBNAIL URL:', data.thumbnailUrl);

  // 5. Document structure
  console.log('\n✅ DOCUMENT STRUCTURE:');
  console.log('   Pages:', data.document.children.length);
  const firstPage = data.document.children[0];
  console.log('   First page name:', firstPage.name);
  console.log('   Frames in first page:', firstPage.children?.length || 0);

  // 6. Node properties (detailed)
  console.log('\n✅ NODE PROPERTIES (what each frame contains):');
  const firstFrame = firstPage.children[0];
  console.log('   Node type:', firstFrame.type);
  console.log('   Node properties:', Object.keys(firstFrame).slice(0, 15).join(', '));

  if (firstFrame.backgroundColor) {
    console.log('   Background color:', firstFrame.backgroundColor);
  }
  if (firstFrame.fills) {
    console.log('   Fills:', firstFrame.fills.length);
  }
  if (firstFrame.effects) {
    console.log('   Effects:', firstFrame.effects.length);
  }
  if (firstFrame.constraints) {
    console.log('   Constraints:', firstFrame.constraints);
  }

  console.log('\n=== WHAT YOU NEED TO FETCH SEPARATELY ===\n');
  console.log('❌ VARIABLES: Requires GET /v1/files/{file_key}/variables/local');
  console.log('❌ PUBLISHED STYLES: Requires GET /v1/styles/{style_key}');

  console.log('\n=== SUMMARY ===');
  console.log('Your current code ONLY uses: document.children (to find first frame)');
  console.log('Available but IGNORED:', [
    data.components ? 'components' : null,
    data.componentSets ? 'component sets' : null,
    data.styles ? 'styles' : null,
    'node properties (fills, effects, constraints)',
    'schema version',
    'metadata'
  ].filter(Boolean).join(', '));
})
.catch(err => console.error('Error:', err.message));
