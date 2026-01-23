// Test script to verify get_figma_components functionality
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { FigmaApiClient } from './figma-smart-image-mcp/dist/figma/api.js';

const token = process.env.FIGMA_TOKEN || readFileSync(homedir() + '/.figma-smart-image-mcp/token', 'utf8').trim();
const fileKey = 'dC3ifprl6oWlApLF1wzOFz';

console.log('Testing component extraction...\n');

const api = new FigmaApiClient(token);

try {
  // Test 1: Get components
  console.log('=== TEST 1: GET COMPONENTS ===');
  const components = await api.getComponents(fileKey);
  console.log(`Found ${components.length} components\n`);

  if (components.length > 0) {
    console.log('First 3 components:');
    components.slice(0, 3).forEach((comp, i) => {
      console.log(`${i + 1}. ${comp.name}`);
      if (comp.description) {
        console.log(`   Description: ${comp.description}`);
      }
      console.log(`   Key: ${comp.key}`);
    });
  }

  // Test 2: Get component sets
  console.log('\n=== TEST 2: GET COMPONENT SETS ===');
  const componentSets = await api.getComponentSets(fileKey);
  console.log(`Found ${componentSets.length} component sets\n`);

  if (componentSets.length > 0) {
    componentSets.forEach((set, i) => {
      console.log(`${i + 1}. ${set.name}`);
      if (set.description) {
        console.log(`   Description: ${set.description}`);
      }
    });
  }

  // Test 3: Get variables
  console.log('\n=== TEST 3: GET VARIABLES ===');
  try {
    const variables = await api.getVariables(fileKey);
    const variablesList = Object.values(variables.meta.variables);
    console.log(`Found ${variablesList.length} variables\n`);

    if (variablesList.length > 0) {
      // Group by type
      const byType = {};
      variablesList.forEach(v => {
        if (!byType[v.resolvedType]) {
          byType[v.resolvedType] = [];
        }
        byType[v.resolvedType].push(v);
      });

      Object.entries(byType).forEach(([type, vars]) => {
        console.log(`${type}: ${vars.length} variables`);
      });
    }
  } catch (error) {
    console.log(`No variables found or error: ${error.message}`);
  }

  console.log('\n✅ All tests completed successfully!');
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
