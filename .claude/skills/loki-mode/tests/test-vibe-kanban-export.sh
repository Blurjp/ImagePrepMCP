#!/bin/bash
# Test: Vibe Kanban Export Functionality
# Tests export script and payload handling

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_DIR=$(mktemp -d)
PASSED=0
FAILED=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; ((PASSED++)); }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; ((FAILED++)); }
log_test() { echo -e "${YELLOW}[TEST]${NC} $1"; }

cleanup() {
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

cd "$TEST_DIR"

echo "========================================"
echo "Vibe Kanban Export Tests"
echo "========================================"
echo ""

# Initialize structure
mkdir -p .loki/{state,queue}
EXPORT_DIR="$TEST_DIR/vibe-export"

# Create mock orchestrator state
cat > .loki/state/orchestrator.json << 'EOF'
{
  "currentPhase": "DEVELOPMENT"
}
EOF

# Test 1: Export with dict payload
log_test "Export task with dict payload"
cat > .loki/queue/pending.json << 'EOF'
[
  {
    "id": "task-001",
    "type": "eng-backend",
    "priority": 5,
    "payload": {
      "action": "Implement API endpoint",
      "description": "Create /api/users endpoint",
      "command": "npm run dev"
    },
    "createdAt": "2024-01-01T00:00:00Z",
    "claimedBy": null,
    "retries": 0
  }
]
EOF

"$SCRIPT_DIR/../scripts/export-to-vibe-kanban.sh" "$EXPORT_DIR" > /dev/null 2>&1

if [ -f "$EXPORT_DIR/task-001.json" ]; then
    title=$(python3 -c "import json; print(json.load(open('$EXPORT_DIR/task-001.json'))['title'])")
    if [[ "$title" == *"Implement API endpoint"* ]]; then
        log_pass "Dict payload exported with correct title"
    else
        log_fail "Dict payload title incorrect: $title"
    fi
else
    log_fail "Export file not created"
fi

# Test 2: Export with string payload
log_test "Export task with string payload"
cat > .loki/queue/pending.json << 'EOF'
[
  {
    "id": "task-002",
    "type": "eng-frontend",
    "priority": 8,
    "payload": "Simple string payload",
    "createdAt": "2024-01-01T00:00:00Z",
    "claimedBy": null,
    "retries": 0
  }
]
EOF

"$SCRIPT_DIR/../scripts/export-to-vibe-kanban.sh" "$EXPORT_DIR" > /dev/null 2>&1

if [ -f "$EXPORT_DIR/task-002.json" ]; then
    title=$(python3 -c "import json; print(json.load(open('$EXPORT_DIR/task-002.json'))['title'])")
    desc=$(python3 -c "import json; print(json.load(open('$EXPORT_DIR/task-002.json'))['description'])")
    if [[ "$title" == *"Task"* ]] && [[ "$desc" == "Simple string payload" ]]; then
        log_pass "String payload exported correctly"
    else
        log_fail "String payload handling incorrect: title=$title, desc=$desc"
    fi
else
    log_fail "Export file not created for string payload"
fi

# Test 3: Priority mapping
log_test "Priority mapping (high/medium/low)"
cat > .loki/queue/pending.json << 'EOF'
[
  {
    "id": "task-high",
    "type": "eng-backend",
    "priority": 9,
    "payload": {"action": "High priority"},
    "createdAt": "2024-01-01T00:00:00Z",
    "claimedBy": null,
    "retries": 0
  },
  {
    "id": "task-medium",
    "type": "eng-backend",
    "priority": 5,
    "payload": {"action": "Medium priority"},
    "createdAt": "2024-01-01T00:00:00Z",
    "claimedBy": null,
    "retries": 0
  },
  {
    "id": "task-low",
    "type": "eng-backend",
    "priority": 2,
    "payload": {"action": "Low priority"},
    "createdAt": "2024-01-01T00:00:00Z",
    "claimedBy": null,
    "retries": 0
  }
]
EOF

"$SCRIPT_DIR/../scripts/export-to-vibe-kanban.sh" "$EXPORT_DIR" > /dev/null 2>&1

high_tag=$(python3 -c "import json; tags=json.load(open('$EXPORT_DIR/task-high.json'))['tags']; print('priority-high' in tags)")
medium_tag=$(python3 -c "import json; tags=json.load(open('$EXPORT_DIR/task-medium.json'))['tags']; print('priority-medium' in tags)")
low_tag=$(python3 -c "import json; tags=json.load(open('$EXPORT_DIR/task-low.json'))['tags']; print('priority-low' in tags)")

if [ "$high_tag" = "True" ] && [ "$medium_tag" = "True" ] && [ "$low_tag" = "True" ]; then
    log_pass "Priority tags mapped correctly"
else
    log_fail "Priority mapping failed: high=$high_tag, medium=$medium_tag, low=$low_tag"
fi

# Test 4: Status mapping
log_test "Status mapping (todo/doing/done/blocked)"
for status in pending in-progress completed failed; do
    echo "[]" > ".loki/queue/$status.json"
done

cat > .loki/queue/in-progress.json << 'EOF'
[
  {
    "id": "task-doing",
    "type": "eng-backend",
    "priority": 5,
    "payload": {"action": "In progress task"},
    "createdAt": "2024-01-01T00:00:00Z",
    "claimedBy": "agent-001",
    "retries": 0
  }
]
EOF

"$SCRIPT_DIR/../scripts/export-to-vibe-kanban.sh" "$EXPORT_DIR" > /dev/null 2>&1

if [ -f "$EXPORT_DIR/task-doing.json" ]; then
    status=$(python3 -c "import json; print(json.load(open('$EXPORT_DIR/task-doing.json'))['status'])")
    if [ "$status" = "doing" ]; then
        log_pass "Status mapped correctly from in-progress to doing"
    else
        log_fail "Status mapping failed: got $status, expected doing"
    fi
else
    log_fail "In-progress task not exported"
fi

# Test 5: Summary file creation
log_test "Summary file creation"
if [ -f "$EXPORT_DIR/_loki_summary.json" ]; then
    phase=$(python3 -c "import json; print(json.load(open('$EXPORT_DIR/_loki_summary.json'))['currentPhase'])")
    if [ "$phase" = "DEVELOPMENT" ]; then
        log_pass "Summary file created with correct phase"
    else
        log_fail "Summary phase incorrect: $phase"
    fi
else
    log_fail "Summary file not created"
fi

# Test 6: Missing orchestrator.json handling
log_test "Handle missing orchestrator.json"
rm -f .loki/state/orchestrator.json
cat > .loki/queue/pending.json << 'EOF'
[
  {
    "id": "task-no-orch",
    "type": "eng-backend",
    "priority": 5,
    "payload": {"action": "Test task"},
    "createdAt": "2024-01-01T00:00:00Z",
    "claimedBy": null,
    "retries": 0
  }
]
EOF

output=$("$SCRIPT_DIR/../scripts/export-to-vibe-kanban.sh" "$EXPORT_DIR" 2>&1)
if [[ "$output" == *"orchestrator.json not found"* ]]; then
    log_pass "Missing orchestrator.json warning displayed"
else
    log_fail "Missing orchestrator.json warning not displayed"
fi

echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
