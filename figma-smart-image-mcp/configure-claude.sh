#!/bin/bash
# Auto-configure Claude Desktop for Figma Smart Image MCP with proper timeout

set -e

echo "🔧 Configuring Claude Desktop for Figma Smart Image MCP..."

# Detect OS and set config path
if [[ "$OSTYPE" == "darwin"* ]]; then
    CONFIG_DIR="$HOME/Library/Application Support/Claude"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    CONFIG_DIR="$HOME/.config/Claude"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    CONFIG_DIR="$APPDATA/Claude"
else
    echo "❌ Unsupported OS: $OSTYPE"
    exit 1
fi

CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"

# Create directory if it doesn't exist
mkdir -p "$CONFIG_DIR"

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "📝 Creating new configuration file..."
    echo '{"mcpServers":{}}' > "$CONFIG_FILE"
fi

# Read existing config
EXISTING_CONFIG=$(cat "$CONFIG_FILE")

# Check if server already exists
if echo "$EXISTING_CONFIG" | grep -q "figma-smart-image"; then
    echo "⚠️  figma-smart-image already exists in config"
    read -p "Do you want to update it? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Cancelled"
        exit 0
    fi
fi

# Use Python to safely merge JSON (if available)
if command -v python3 &> /dev/null; then
    python3 << 'EOF'
import json
import sys

config_file = sys.argv[1]

# Read existing config
try:
    with open(config_file, 'r') as f:
        config = json.load(f)
except:
    config = {"mcpServers": {}}

# Ensure mcpServers exists
if "mcpServers" not in config:
    config["mcpServers"] = {}

# Add or update figma-smart-image
config["mcpServers"]["figma-smart-image"] = {
    "url": "https://figma-smart-image-mcp-production.up.railway.app/mcp",
    "timeout": 180000
}

# Write back
with open(config_file, 'w') as f:
    json.dump(config, f, indent=2)

print("✅ Configuration updated successfully!")
EOF
    python3 -c "import sys; sys.exit(0)" "$CONFIG_FILE"
else
    echo "⚠️  Python3 not found. Please manually add this to $CONFIG_FILE:"
    echo ""
    echo '{'
    echo '  "mcpServers": {'
    echo '    "figma-smart-image": {'
    echo '      "url": "https://figma-smart-image-mcp-production.up.railway.app/mcp",'
    echo '      "timeout": 180000'
    echo '    }'
    echo '  }'
    echo '}'
    exit 1
fi

echo ""
echo "✅ Done! Configuration saved to:"
echo "   $CONFIG_FILE"
echo ""
echo "📋 Next steps:"
echo "   1. Restart Claude Desktop"
echo "   2. Visit https://figma-smart-image-mcp-production.up.railway.app/ to authenticate"
echo "   3. Try asking Claude to process a Figma link!"
