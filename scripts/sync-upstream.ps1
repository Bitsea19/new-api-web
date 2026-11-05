<#
.SYNOPSIS
    从上游 QuantumNous/new-api 同步前端改动到本仓库（二开版），且不覆盖二开代码。

.DESCRIPTION
    原理：
    本仓库历史的最底层是「上游前端快照基线」提交（分支 upstream-web），
    它的 tree 就是上游仓库 web/ 目录在某个 commit 上的内容。
    因此 `git merge upstream-web` 会以该快照为共同祖先做三方合并：
      - 上游改的文件   → 自动合入
      - 二开改的文件   → 保留二开版本（若双方都改则产生冲突，需人工处理）

    本脚本流程：
      1. fetch 上游
      2. 找到上游最新 commit 中 web/ 目录相对当前快照基线有变化的版本
      3. 用上游 web/ 的 tree 生成新的快照提交（父子关系串在 upstream-web 上）
      4. git merge upstream-web，把上游改动并入当前分支

    冲突处理：合并后若有冲突文件，用 `git checkout --ours <文件>` 保留二开版本，
    或 `git checkout --theirs <文件>` 采用上游版本，然后 `git add` 并提交。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/sync-upstream.ps1
    powershell -ExecutionPolicy Bypass -File scripts/sync-upstream.ps1 -DryRun
#>
param(
    [string]$Upstream = 'upstream',
    [string]$Branch   = 'main',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Write-Step { param([string]$Msg) Write-Host "==> $Msg" -ForegroundColor Cyan }

function New-CommitObject {
    param(
        [string]$Tree,
        [string]$Parent,
        [string]$Author,
        [string]$Committer,
        [string]$Message
    )
    $sb = [System.Text.StringBuilder]::new()
    [void]$sb.Append("tree $Tree`n")
    if ($Parent) { [void]$sb.Append("parent $Parent`n") }
    [void]$sb.Append("author $Author`n")
    [void]$sb.Append("committer $Committer`n")
    [void]$sb.Append("`n")
    [void]$sb.Append($Message)
    [void]$sb.Append("`n")
    $enc = New-Object System.Text.UTF8Encoding($false)
    $bytes = $enc.GetBytes($sb.ToString())
    $tmp = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllBytes($tmp, $bytes)
    $sha = (git hash-object -t commit -w $tmp).Trim()
    Remove-Item $tmp -Force
    return $sha
}

Write-Step "拉取上游 $Upstream/$Branch"
git fetch $Upstream $Branch

$upstreamSha = (git rev-parse "$Upstream/$Branch").Trim()
$upstreamWebTree = (git rev-parse "${upstreamSha}:web").Trim()
$currentSnapTree = (git rev-parse "upstream-web^{tree}").Trim()

Write-Step "上游 commit : $upstreamSha"
Write-Step "上游 web 树 : $upstreamWebTree"
Write-Step "当前快照树 : $currentSnapTree"

if ($upstreamWebTree -eq $currentSnapTree) {
    Write-Host "上游前端无变化，无需同步。" -ForegroundColor Green
    exit 0
}

# 找出 web/ 目录最后一个发生变化的上游 commit，作为快照落点
Write-Step "定位上游 web/ 的最近一次变更"
$tip = $null
foreach ($c in (git rev-list "$Upstream/$Branch" -- web/ | Select-Object -First 200)) {
    if ((git rev-parse "${c}:web").Trim() -eq $upstreamWebTree) { $tip = $c; break }
}
if (-not $tip) { throw "无法定位上游 web/ 的变更点" }
Write-Host "变更点: $tip $(git log -1 --format='%ci %s' $tip)"

# 构造新的快照提交
$snapParent = (git rev-parse upstream-web).Trim()
$stamp = (git log -1 --format='%ad' --date=format:'%Y%m%d%H%M%S' $tip)
$newSnap = New-CommitObject -Tree $upstreamWebTree -Parent $snapParent `
    -Author "New API contributors <noreply@newapi.pro> $stamp +0800" `
    -Committer "New API contributors <noreply@newapi.pro> $stamp +0800" `
    -Message "upstream(web): 上游前端快照更新 ($tip)`n`n同步自 QuantumNous/new-api 的 web/ 目录。作为二开合并基线。"

git update-ref refs/heads/upstream-web $newSnap $snapParent
Write-Step "新快照提交: $newSnap"

if ($DryRun) {
    Write-Host "DryRun：仅更新 upstream-web 分支，未合并。" -ForegroundColor Yellow
    git log --oneline -3 upstream-web
    exit 0
}

# 合并
Write-Step "合并上游改动到当前分支"
git merge --no-ff --no-commit upstream-web

$conflicts = @(git diff --name-only --diff-filter=U)
if ($conflicts.Count -gt 0) {
    Write-Host "以下文件存在冲突（上游与二开都改过），请人工处理：" -ForegroundColor Yellow
    $conflicts | ForEach-Object { Write-Host "  $_" }
    Write-Host "保留二开版本: git checkout --ours <文件>" -ForegroundColor DarkGray
    Write-Host "采用上游版本: git checkout --theirs <文件>" -ForegroundColor DarkGray
    Write-Host "处理后执行: git add <文件> && git commit" -ForegroundColor DarkGray
} else {
    Write-Host "无冲突，上游改动已自动合入。" -ForegroundColor Green
}

Write-Step "变更清单"
git status --short
Write-Step "完成：检查后执行 git commit 提交合并结果"
