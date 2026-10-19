# Link every skill in <repo>/.agents/skills (the source) into the project skill directories of agents
# that do not read .agents/skills themselves:
#   .claude/skills/  -> Claude Code
#   .agent/skills/   -> Antigravity (workspace skills)
# Codex and Gemini CLI read .agents/skills directly. Uses junctions: no admin rights or Developer Mode needed.
# Junctions store absolute paths: re-run after moving or cloning the repo, or after adding/removing a skill.
#   powershell -ExecutionPolicy Bypass -File .agents\link-skills.ps1
# Keep this file ASCII-only: Windows PowerShell 5.1 misreads UTF-8 without BOM.

$root = Split-Path $PSScriptRoot -Parent
$src = Join-Path $PSScriptRoot "skills"
$targets = @(
    (Join-Path $root ".claude\skills"),
    (Join-Path $root ".agent\skills")
)

foreach ($target in $targets) {
    New-Item -ItemType Directory -Force $target | Out-Null

    # Remove links into .agents/skills whose source skill was deleted/renamed, or that point to an old repo location.
    # rmdir removes only the link, never the content.
    foreach ($item in Get-ChildItem $target -Directory -Force) {
        if ($item.LinkType -ne "Junction" -and $item.LinkType -ne "SymbolicLink") { continue }
        $dest = @($item.Target)[0]
        $expected = Join-Path $src $item.Name
        if ($dest -and ($dest -ne $expected -or -not (Test-Path $expected)) -and $dest -match '[\\/]\.agents[\\/]skills[\\/]') {
            cmd /c rmdir "$($item.FullName)"
            Write-Host "Removed stale link $($item.FullName)"
        }
    }

    foreach ($skill in Get-ChildItem $src -Directory) {
        $link = Join-Path $target $skill.Name
        if (Test-Path $link) {
            $item = Get-Item $link -Force
            if ($item.LinkType -eq "Junction" -or $item.LinkType -eq "SymbolicLink") { continue }
            Write-Warning "Skipped $link (a real directory exists, not a link)"
            continue
        }
        New-Item -ItemType Junction -Path $link -Target $skill.FullName | Out-Null
        Write-Host "Linked $link -> $($skill.FullName)"
    }
}
