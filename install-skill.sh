#!/bin/bash
set -e

SKILL_NAME="publish-wechat-draft"
TARGET_DIR="$HOME/.claude/skills/$SKILL_NAME"
SOURCE_URL="https://raw.githubusercontent.com/lixinran2015/weixingongzhonghao/main/.claude/skills/$SKILL_NAME/SKILL.md"

echo "Installing $SKILL_NAME to $TARGET_DIR..."
mkdir -p "$TARGET_DIR"
curl -fsSL "$SOURCE_URL" -o "$TARGET_DIR/SKILL.md"

echo "✅ Skill installed successfully."
echo ""
echo "Next steps:"
echo "  1. Clone the publisher project (if you haven't):"
echo "     git clone https://github.com/lixinran2015/weixingongzhonghao.git"
echo "  2. Start a new Claude Code session and say: 'publish wechat draft'"
