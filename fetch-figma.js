// Quick script to fetch Figma design
const token = process.env.FIGMA_TOKEN;
const fileKey = 'dC3ifprl6oWlApLF1wzOFz';

if (!token) {
  console.log('ERROR: FIGMA_TOKEN not set');
  console.log('Get token from: https://figma-smart-image-mcp-production.up.railway.app/');
  process.exit(1);
}

console.log('Fetching Figma file...');
fetch(`https://api.figma.com/v1/files/${fileKey}`, {
  headers: { 'X-Figma-Token': token }
})
.then(r => r.json())
.then(data => {
  if (data.err || data.status === 403 || data.status === 401) {
    console.log('ERROR: Invalid token');
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log('\n✅ SUCCESS!\n');
    console.log('File name:', data.name);
    console.log('Last modified:', data.lastModified);
    console.log('Pages:', data.document.children.length);

    data.document.children.forEach((page, i) => {
      console.log(`\nPage ${i + 1}: ${page.name}`);
      console.log(`  - Frames: ${page.children?.length || 0}`);
      if (page.children && page.children.length > 0) {
        page.children.slice(0, 5).forEach(frame => {
          console.log(`    - ${frame.name}`);
        });
        if (page.children.length > 5) {
          console.log(`    ... and ${page.children.length - 5} more`);
        }
      }
    });
  }
})
.catch(err => console.error('Fetch error:', err.message));
