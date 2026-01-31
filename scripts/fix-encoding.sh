#!/bin/bash
# ============================================================
# fix-encoding.sh - 自动修复 Ubuntu/WSL 中文字符编码问题
# ============================================================

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

say() { echo -e "${GREEN}==>${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
err() { echo -e "${RED}[error]${NC} $1"; }

# 检查是否在 WSL/Ubuntu 环境中
if [ ! -f /etc/os-release ]; then
  err "此脚本仅支持 Linux 系统"
  exit 1
fi

say "开始修复中文字符编码问题..."

# 1. 安装中文语言包和字体
say "安装中文语言包和字体..."
sudo apt-get update -qq
sudo apt-get install -y language-pack-zh-hans fonts-noto-cjk fonts-wqy-microhei fonts-wqy-zenhei locales

# 2. 生成 locale
say "生成 UTF-8 locale..."
sudo locale-gen zh_CN.UTF-8
sudo locale-gen en_US.UTF-8
sudo update-locale LANG=zh_CN.UTF-8

# 3. 配置当前会话
say "配置当前会话环境变量..."
export LANG=zh_CN.UTF-8
export LC_ALL=zh_CN.UTF-8
export LANGUAGE=zh_CN:zh

# 4. 添加到 shell 配置文件
say "添加到 shell 配置文件..."

# 检测使用的 shell
SHELL_RC=""
if [ -n "$BASH_VERSION" ]; then
  SHELL_RC="$HOME/.bashrc"
elif [ -n "$ZSH_VERSION" ]; then
  SHELL_RC="$HOME/.zshrc"
else
  SHELL_RC="$HOME/.profile"
fi

# 添加编码配置
if [ -f "$SHELL_RC" ]; then
  if ! grep -q "LANG=zh_CN.UTF-8" "$SHELL_RC"; then
    cat >> "$SHELL_RC" << 'EOF'

# ============================================================
# UTF-8 编码配置 (自动添加)
# ============================================================
export LANG=zh_CN.UTF-8
export LC_ALL=zh_CN.UTF-8
export LANGUAGE=zh_CN:zh
EOF
    say "已添加编码配置到 $SHELL_RC"
  else
    say "编码配置已存在于 $SHELL_RC"
  fi
fi

# 5. 配置 Git 编码
say "配置 Git UTF-8 编码..."
git config --global core.quotepath false
git config --global gui.encoding utf-8
git config --global i18n.commit.encoding utf-8
git config --global i18n.logoutputencoding utf-8

# 6. 测试中文显示
say "测试中文显示..."
echo ""
echo "=========================================="
echo "测试输出: 你好世界 Hello World 🎉"
echo "=========================================="
echo ""

# 7. 显示当前 locale 设置
say "当前 locale 设置:"
locale

echo ""
echo "=========================================="
echo "✅ 编码修复完成!"
echo "=========================================="
echo ""
echo "提示:"
echo "  • 重新打开终端或运行 'source $SHELL_RC' 使配置生效"
echo "  • 如果仍有问题,请检查终端模拟器是否支持 UTF-8"
echo ""
