# ============================================================
# install-wsl.ps1 — Clawdbot + WeChat plugin installer for Windows via WSL
#
# Run:
#   iwr -useb https://cpilot.net/downloads/install-wsl.ps1 | iex
#   Or: powershell -ExecutionPolicy Bypass -File install-wsl.ps1
#
# Env overrides:
#   $env:CLAWDBOT_PORT=18789
#   $env:NGROK_AUTHTOKEN="your_token"
#   $env:AUTO_Y=1
#   $env:NPM_REGISTRY="https://registry.npmmirror.com"
#   $env:PLUGIN_GIT_REPO="https://github.com/NannaOlympicBroadcast/clawdbot-wechat-plugin"
#   $env:GIT_MIRROR_PREFIX="https://ghfast.top/"
#   $env:WSL_DISTRO="Ubuntu"  # or "Ubuntu-22.04", "Ubuntu-24.04"
# ============================================================

#Requires -Version 5.1

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# ------------------ Config ------------------
$PORT = if ($env:CLAWDBOT_PORT) { [int]$env:CLAWDBOT_PORT } else { 18789 }
$WSL_DISTRO = if ($env:WSL_DISTRO) { $env:WSL_DISTRO } else { "Ubuntu" }

$DEFAULT_NPM_REGISTRY = "https://registry.npmmirror.com"
$NPM_REGISTRY = if ($env:NPM_REGISTRY) { $env:NPM_REGISTRY } else { $DEFAULT_NPM_REGISTRY }

$PLUGIN_GIT_REPO = if ($env:PLUGIN_GIT_REPO) { $env:PLUGIN_GIT_REPO } else { "https://github.com/NannaOlympicBroadcast/clawdbot-wechat-plugin" }
$GIT_MIRROR_PREFIX = if ($env:GIT_MIRROR_PREFIX -ne $null) { $env:GIT_MIRROR_PREFIX } else { "https://ghfast.top/" }

# ------------------ Console helpers ------------------
function Say([string]$Message) { Write-Host "==> " -ForegroundColor Green -NoNewline; Write-Host $Message }
function Warn([string]$Message) { Write-Host "[warn] " -ForegroundColor Yellow -NoNewline; Write-Host $Message }
function Err([string]$Message) { Write-Host "[error] " -ForegroundColor Red -NoNewline; Write-Host $Message }
function Die([string]$Message) { Err $Message; exit 1 }

function Ask-YesNo([string]$Prompt, [string]$Default="N") {
  if ($env:AUTO_Y -eq "1") { Say "AUTO_Y=1: 自动选择 Yes ($Prompt)"; return $true }
  while ($true) {
    if ($Default -eq "Y") {
      $answer = Read-Host "$Prompt [Y/n]"
      if ([string]::IsNullOrWhiteSpace($answer)) { $answer = "Y" }
    } else {
      $answer = Read-Host "$Prompt [y/N]"
      if ([string]::IsNullOrWhiteSpace($answer)) { $answer = "N" }
    }
    switch ($answer.ToUpper()) {
      "Y" { return $true }
      "N" { return $false }
      default { Write-Host "请输入 y 或 n" }
    }
  }
}

# ------------------ Risk notice ------------------
function Show-RiskNotice {
  Write-Host ""
  Write-Host "  ⚠️  关于 Clawdbot 的重要说明  " -BackgroundColor DarkBlue -ForegroundColor White
  Write-Host ""
  Write-Host "Clawdbot 是一个 AI 智能体工具，可以帮助你自动化处理任务。" -ForegroundColor Cyan
  Write-Host "为了完成工作，它可能会：" -ForegroundColor White
  Write-Host ""
  Write-Host "  • 在你的 WSL 环境中执行命令" -ForegroundColor Yellow
  Write-Host "    （比如创建文件、安装依赖、启动服务等）"
  Write-Host ""
  Write-Host "  • 读取和修改工作区文件" -ForegroundColor Yellow
  Write-Host "    （比如读取代码、生成文档、修改配置等）"
  Write-Host ""
  Write-Host "  • 访问网络和调用 API" -ForegroundColor Yellow
  Write-Host "    （比如调用 AI 模型、查询信息等）"
  Write-Host ""
  Write-Host "  • 可能产生费用" -ForegroundColor Yellow
  Write-Host "    （如果使用付费 API 服务）"
  Write-Host ""
  Write-Host "💡 使用建议：" -ForegroundColor Green
  Write-Host "  • 建议在个人电脑或测试环境中使用"
  Write-Host "  • 建议为 Clawdbot 创建专用工作目录"
  Write-Host "  • 避免在包含敏感信息的目录中使用"
  Write-Host "  • 妥善保管 ngrok URL 和访问 token"
  Write-Host ""
  Write-Host "📦 WSL 安装说明：" -ForegroundColor Cyan
  Write-Host "  • 此脚本将在 WSL (Windows Subsystem for Linux) 中安装 Clawdbot"
  Write-Host "  • 如果未安装 WSL，将自动安装 WSL 2 和 Ubuntu"
  Write-Host "  • 需要管理员权限，可能需要重启系统"
  Write-Host "  • 至少需要 4GB 可用磁盘空间"
  Write-Host ""
}

# ------------------ WSL Detection ------------------
function Test-WSLInstalled {
  try {
    $result = & wsl --status 2>$null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Test-WSLDistroExists([string]$Distro) {
  try {
    $distros = & wsl --list --quiet 2>$null
    if ($LASTEXITCODE -ne 0) { return $false }
    return $distros -contains $Distro
  } catch {
    return $false
  }
}

function Get-WindowsVersion {
  $os = Get-CimInstance Win32_OperatingSystem
  return [version]$os.Version
}

function Test-WSLSupported {
  $version = Get-WindowsVersion
  # WSL 2 requires Windows 10 version 2004 (build 19041) or higher
  if ($version.Major -eq 10 -and $version.Build -ge 19041) { return $true }
  if ($version.Major -gt 10) { return $true }
  return $false
}

# ------------------ WSL Installation ------------------
function Enable-WSLFeatures {
  Say "启用 WSL 所需的 Windows 功能..."
  
  try {
    # Enable Virtual Machine Platform
    Say "启用虚拟机平台..."
    & dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart | Out-Null
    
    # Enable WSL
    Say "启用 Windows Subsystem for Linux..."
    & dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart | Out-Null
    
    Say "Windows 功能已启用"
    return $true
  } catch {
    Err "启用 Windows 功能失败: $($_.Exception.Message)"
    return $false
  }
}

function Install-WSL {
  Say "检测 WSL 安装状态..."
  
  if (Test-WSLInstalled) {
    Say "WSL 已安装"
    return $true
  }
  
  if (-not (Test-WSLSupported)) {
    Die "您的 Windows 版本不支持 WSL 2。需要 Windows 10 版本 2004 (build 19041) 或更高版本。"
  }
  
  Say "未检测到 WSL，准备安装..."
  
  if (-not (Ask-YesNo "是否现在安装 WSL 2？（需要管理员权限，可能需要重启）" "Y")) {
    Die "已取消安装。如需继续，请手动安装 WSL 后重新运行此脚本"
  }
  
  # Check if running as administrator
  $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  
  if (-not $isAdmin) {
    Say "需要管理员权限，正在重新启动脚本..."
    $scriptPath = $MyInvocation.MyCommand.Path
    if ([string]::IsNullOrEmpty($scriptPath)) {
      Die "无法获取脚本路径。请以管理员身份手动运行此脚本。"
    }
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" -Verb RunAs
    exit 0
  }
  
  Say "使用 wsl --install 安装 WSL..."
  try {
    & wsl --install --no-distribution
    
    if ($LASTEXITCODE -ne 0) {
      Warn "wsl --install 失败，尝试手动启用功能..."
      if (-not (Enable-WSLFeatures)) {
        Die "WSL 安装失败"
      }
    }
    
    Say "WSL 安装完成"
    
    # Check if reboot is required
    if (-not (Test-WSLInstalled)) {
      Write-Host ""
      Write-Host "========================================" -ForegroundColor Yellow
      Write-Host "⚠️  需要重启系统" -ForegroundColor Yellow
      Write-Host "========================================" -ForegroundColor Yellow
      Write-Host ""
      Write-Host "WSL 功能已启用，但需要重启系统才能生效。" -ForegroundColor Cyan
      Write-Host ""
      if (Ask-YesNo "是否现在重启系统？" "Y") {
        Say "正在重启系统..."
        Restart-Computer -Force
      } else {
        Write-Host ""
        Write-Host "请手动重启系统后，重新运行此脚本继续安装。" -ForegroundColor Yellow
        Write-Host ""
        exit 0
      }
    }
    
    return $true
  } catch {
    Err "WSL 安装失败: $($_.Exception.Message)"
    return $false
  }
}

function Install-WSLDistro([string]$Distro) {
  Say "检查 WSL 发行版: $Distro"
  
  if (Test-WSLDistroExists $Distro) {
    Say "发行版 $Distro 已安装"
    return $true
  }
  
  Say "安装 Ubuntu 发行版...（请安装完成后在看到的Ubuntu终端输入'exit'并继续安装）"
  
  try {
    & wsl --install -d $Distro
    
    if ($LASTEXITCODE -ne 0) {
      Err "安装 $Distro 失败"
      return $false
    }
    
    Say "等待 Ubuntu 初始化..."
    Start-Sleep -Seconds 5
    
    # Verify installation
    if (Test-WSLDistroExists $Distro) {
      Say "Ubuntu 安装成功"
      return $true
    } else {
      Err "Ubuntu 安装验证失败"
      return $false
    }
  } catch {
    Err "安装 Ubuntu 失败: $($_.Exception.Message)"
    return $false
  }
}

function Set-WSLVersion2([string]$Distro) {
  Say "设置 $Distro 使用 WSL 2..."
  try {
    & wsl --set-version $Distro 2 2>$null | Out-Null
    & wsl --set-default-version 2 2>$null | Out-Null
    Say "WSL 2 配置完成"
  } catch {
    Warn "设置 WSL 2 失败，但可以继续: $($_.Exception.Message)"
  }
}

# ------------------ Linux script generation ------------------
function Get-LinuxInstallScript {
  $ngrokToken = if ($env:NGROK_AUTHTOKEN) { $env:NGROK_AUTHTOKEN } else { "" }
  
  # Use single quotes to avoid PowerShell variable expansion
  $script = @'
#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

say() { echo -e "${GREEN}==>${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
err() { echo -e "${RED}[error]${NC} $1"; }
die() { err "$1"; exit 1; }

# Config
PORT=__PORT__
NPM_REGISTRY="__NPM_REGISTRY__"
PLUGIN_GIT_REPO="__PLUGIN_GIT_REPO__"
GIT_MIRROR_PREFIX="__GIT_MIRROR_PREFIX__"
NGROK_AUTHTOKEN="__NGROK_AUTHTOKEN__"

USER_HOME=$HOME
BASE_DIR="$USER_HOME/.clawdbot-wechat"
SRC_DIR="$BASE_DIR/src"
LOG_DIR="$BASE_DIR"
CLAWDBOT_CONFIG="$USER_HOME/.clawdbot/clawdbot.json"

mkdir -p "$LOG_DIR"
mkdir -p "$SRC_DIR"

# ------------------ System preparation ------------------
say "更新系统包列表..."
sudo apt-get update -qq

say "安装必要的依赖..."
sudo apt-get install -y curl git build-essential ca-certificates gnupg jq netcat-openbsd

# ------------------ UTF-8 and Chinese support ------------------
say "配置 UTF-8 编码和中文支持..."
sudo apt-get install -y language-pack-zh-hans fonts-noto-cjk locales

# Generate UTF-8 locale
sudo locale-gen zh_CN.UTF-8
sudo locale-gen en_US.UTF-8

# Set environment variables for current session
export LANG=zh_CN.UTF-8
export LC_ALL=zh_CN.UTF-8

# Add to .bashrc for persistence
if ! grep -q "LANG=zh_CN.UTF-8" "$HOME/.bashrc"; then
  echo "" >> "$HOME/.bashrc"
  echo "# UTF-8 encoding for Chinese support" >> "$HOME/.bashrc"
  echo "export LANG=zh_CN.UTF-8" >> "$HOME/.bashrc"
  echo "export LC_ALL=zh_CN.UTF-8" >> "$HOME/.bashrc"
  say "已添加 UTF-8 编码配置到 ~/.bashrc"
fi

# ------------------ Node.js installation ------------------
say "检查 Node.js 版本..."
if command -v node &> /dev/null; then
  NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -ge 22 ]; then
    say "Node.js $(node -v) 已安装"
  else
    say "Node.js 版本过低，需要升级到 22+"
    NODE_VERSION=0
  fi
else
  NODE_VERSION=0
fi

if [ "$NODE_VERSION" -lt 22 ]; then
  say "安装 Node.js 22 LTS..."
  sudo apt-get remove -y nodejs npm 2>/dev/null || true
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  say "Node.js $(node -v) 安装完成"
  say "npm $(npm -v) 安装完成"
fi

# ------------------ npm configuration ------------------
say "配置 npm registry: $NPM_REGISTRY"
npm config set registry "$NPM_REGISTRY"
npm config set fund false
npm config set audit false

# ------------------ Clawdbot installation ------------------
say "检查 Clawdbot/Moltbot..."
if command -v clawdbot &> /dev/null || command -v moltbot &> /dev/null; then
  say "Clawdbot 已安装，跳过安装"
else
  say "安装 Clawdbot..."
  npm install -g clawdbot@latest
fi

# Detect CLI
if command -v clawdbot &> /dev/null; then
  CLI="clawdbot"
elif command -v moltbot &> /dev/null; then
  CLI="moltbot"
else
  die "未找到 clawdbot/moltbot 命令"
fi

say "使用 CLI: $CLI"

# ------------------ Plugin installation ------------------
say "安装 WeChat webhook 插件..."

REPO_DIR="$SRC_DIR/clawdbot-wechat-plugin"
PLUGIN_SUBDIR="clawdbot-plugin-webhook-server"

if [ -d "$REPO_DIR" ]; then
  say "源码目录已存在，执行 git pull..."
  cd "$REPO_DIR"
  git pull --rebase || warn "git pull 失败，使用现有代码"
else
  say "克隆插件仓库..."
  CLONE_SUCCESS=0
  if [ -n "$GIT_MIRROR_PREFIX" ]; then
    MIRROR_URL="${GIT_MIRROR_PREFIX}${PLUGIN_GIT_REPO}"
    say "尝试镜像: $MIRROR_URL"
    if git clone --depth 1 "$MIRROR_URL" "$REPO_DIR" 2>/dev/null; then
      CLONE_SUCCESS=1
    fi
  fi
  
  if [ $CLONE_SUCCESS -eq 0 ]; then
    say "尝试原始仓库: $PLUGIN_GIT_REPO"
    git clone --depth 1 "$PLUGIN_GIT_REPO" "$REPO_DIR" || die "git clone 失败"
  fi
fi

PLUGIN_DIR="$REPO_DIR/$PLUGIN_SUBDIR"
[ -d "$PLUGIN_DIR" ] || die "未找到插件目录: $PLUGIN_SUBDIR"

say "构建插件..."
cd "$PLUGIN_DIR"
npm install --no-fund --no-audit
npm run build

[ -f "dist/index.js" ] || die "构建失败：未找到 dist/index.js"

say "安装插件到 Clawdbot..."
$CLI plugins install -l "$PLUGIN_DIR"
$CLI plugins enable webhook-server

# ------------------ ngrok installation ------------------
say "安装 ngrok..."

if command -v ngrok &> /dev/null; then
  say "ngrok 已安装"
else
  ARCH=$(uname -m)
  if [ "$ARCH" = "x86_64" ]; then
    NGROK_ARCH="amd64"
  elif [ "$ARCH" = "aarch64" ]; then
    NGROK_ARCH="arm64"
  else
    NGROK_ARCH="386"
  fi
  
  NGROK_URL="https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-${NGROK_ARCH}.tgz"
  say "下载 ngrok: $NGROK_URL"
  curl -fsSL "$NGROK_URL" -o /tmp/ngrok.tgz
  sudo tar xzf /tmp/ngrok.tgz -C /usr/local/bin
  rm /tmp/ngrok.tgz
  say "ngrok 安装完成: $(ngrok version)"
fi

# Configure ngrok token
if [ -n "$NGROK_AUTHTOKEN" ]; then
  say "配置 ngrok authtoken..."
  ngrok config add-authtoken "$NGROK_AUTHTOKEN"
else
  if ! ngrok config check &>/dev/null; then
    warn "未配置 ngrok authtoken"
    echo ""
    echo "请访问 https://dashboard.ngrok.com/get-started/your-authtoken 获取 token"
    read -p "请输入 ngrok authtoken: " NGROK_AUTHTOKEN
    if [ -n "$NGROK_AUTHTOKEN" ]; then
      ngrok config add-authtoken "$NGROK_AUTHTOKEN"
    else
      warn "未配置 ngrok token，稍后需要手动配置"
    fi
  fi
fi

# ------------------ Onboarding ------------------
say "执行 Clawdbot onboard..."

if [ -f "$CLAWDBOT_CONFIG" ]; then
  LAST_RUN=$(jq -r '.wizard.lastRunAt // empty' "$CLAWDBOT_CONFIG" 2>/dev/null || echo "")
  if [ -n "$LAST_RUN" ]; then
    say "检测到已完成 onboard，跳过"
  else
    NEED_ONBOARD=1
  fi
else
  NEED_ONBOARD=1
fi

if [ "${NEED_ONBOARD:-0}" = "1" ]; then
  GW_TOKEN=$(openssl rand -hex 24)
  $CLI onboard \
    --accept-risk \
    --flow quickstart \
    --mode local \
    --gateway-port $PORT \
    --gateway-bind loopback \
    --gateway-auth token \
    --gateway-token "$GW_TOKEN" \
    --install-daemon \
    --skip-channels \
    --skip-skills \
    --skip-health \
    --skip-ui \
    --skip-daemon
fi

# ------------------ Start services ------------------
say "启动 gateway..."
pkill -f "$CLI gateway" 2>/dev/null || true
sleep 2

nohup $CLI gateway > "$LOG_DIR/gateway.log" 2>&1 &
GATEWAY_PID=$!

say "等待 gateway 启动..."
for i in {1..30}; do
  if nc -z 127.0.0.1 $PORT 2>/dev/null; then
    say "Gateway 已启动 (PID: $GATEWAY_PID)"
    break
  fi
  sleep 1
done

# ------------------ Start ngrok ------------------
say "启动 ngrok..."
pkill ngrok 2>/dev/null || true
sleep 2

nohup ngrok http $PORT --log=stdout > "$LOG_DIR/ngrok.log" 2>&1 &
NGROK_PID=$!

say "等待 ngrok 启动..."
sleep 5

# Get ngrok public URL
NGROK_URL=""
for i in {1..20}; do
  NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | jq -r '.tunnels[0].public_url // empty' 2>/dev/null || echo "")
  if [ -n "$NGROK_URL" ]; then
    break
  fi
  sleep 1
done

# Get gateway token
GW_TOKEN=$(jq -r '.gateway.auth.token // empty' "$CLAWDBOT_CONFIG" 2>/dev/null || echo "")

# ------------------ Display results ------------------
echo ""
echo "========================================"
echo "✅ 安装完成！"
echo "========================================"
echo ""

if [ -n "$NGROK_URL" ] && [ -n "$GW_TOKEN" ]; then
  echo "下一步：在 万格小智元 公众号中输入以下命令来绑定设备"
  echo ""
  echo "  bind $NGROK_URL $GW_TOKEN"
  echo ""
  echo "绑定后即可开始使用 Clawdbot 🎉"
else
  warn "未能自动获取连接信息"
  echo ""
  echo "请手动获取："
  echo "  • ngrok URL: curl -s http://127.0.0.1:4040/api/tunnels | jq -r '.tunnels[0].public_url'"
  echo "  • Gateway Token: jq -r '.gateway.auth.token' $CLAWDBOT_CONFIG"
fi

echo ""
echo "日志文件："
echo "  • Gateway: $LOG_DIR/gateway.log"
echo "  • ngrok: $LOG_DIR/ngrok.log"
echo ""

say "安装完成！祝使用愉快 ✨"
'@
  
  # Replace placeholders with actual values
  $script = $script.Replace('__PORT__', $PORT)
  $script = $script.Replace('__NPM_REGISTRY__', $NPM_REGISTRY)
  $script = $script.Replace('__PLUGIN_GIT_REPO__', $PLUGIN_GIT_REPO)
  $script = $script.Replace('__GIT_MIRROR_PREFIX__', $GIT_MIRROR_PREFIX)
  $script = $script.Replace('__NGROK_AUTHTOKEN__', $ngrokToken)
  
  return $script
}

# ------------------ Main execution ------------------
function Main {
  Show-RiskNotice
  
  if (-not (Ask-YesNo "我已了解上述说明，继续安装 Clawdbot (WSL 版本)" "Y")) {
    Say "已取消安装。如需使用，请随时重新运行此脚本"
    exit 0
  }
  
  Say "开始安装 Clawdbot (WSL 版本)..."
  
  # Install WSL if needed
  if (-not (Install-WSL)) {
    Die "WSL 安装失败"
  }
  
  # Install Ubuntu distribution
  if (-not (Install-WSLDistro $WSL_DISTRO)) {
    Die "Ubuntu 安装失败"
  }
  
  # Set WSL 2
  Set-WSLVersion2 $WSL_DISTRO
  
  # Generate Linux installation script
  Say "生成 Linux 安装脚本..."
  $linuxScript = Get-LinuxInstallScript
  
  # Create temp file in WSL
  $tempScript = "/tmp/install-clawdbot-$(Get-Random).sh"
  
  Say "传输安装脚本到 WSL..."
  $linuxScript | & wsl -d $WSL_DISTRO bash -c "cat > $tempScript && chmod +x $tempScript"
  
  # Execute installation in WSL
  Say "在 WSL 中执行安装..."
  Write-Host ""
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host "开始在 Ubuntu 中安装..." -ForegroundColor Cyan
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host ""
  
  & wsl -d $WSL_DISTRO bash $tempScript
  
  # Cleanup
  & wsl -d $WSL_DISTRO rm -f $tempScript
  
  Write-Host ""
  Write-Host "========================================" -ForegroundColor Green
  Write-Host "✅ WSL 安装流程完成！" -ForegroundColor Green
  Write-Host "========================================" -ForegroundColor Green
  Write-Host ""
  Write-Host "提示：" -ForegroundColor Cyan
  Write-Host "  • 服务运行在 WSL 中，可以通过 localhost:$PORT 访问"
  Write-Host "  • 要进入 WSL 环境，运行: wsl -d $WSL_DISTRO"
  Write-Host "  • 查看日志: wsl -d $WSL_DISTRO cat ~/.clawdbot-wechat/gateway.log"
  Write-Host ""
}

try {
  Main
} catch {
  Err "安装过程中发生错误：$($_.Exception.Message)"
  Write-Host $_.ScriptStackTrace -ForegroundColor Red
  exit 1
}
