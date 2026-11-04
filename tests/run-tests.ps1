# Проверка сайта и «Финансового суда» одной командой (из папки проекта):
#   powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1
#   powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1 -Cases 300   — больше пробных заседаний
# Копия index.html с проверками (tests/court-test.js) открывается в невидимом окне Edge, сайт не меняется.
# Отчёт — на экране и в tests/last-report.txt. Код выхода 0 — всё в порядке, 1 — есть ошибки.

param([int]$Cases = 100)

$root = Split-Path $PSScriptRoot -Parent
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Host 'Не найден Microsoft Edge — проверка не запущена.'; exit 1 }

# Временная папка: копия страницы и отдельный профиль браузера (своя память, без ваших данных)
$tmp = Join-Path $env:TEMP 'fin-no-sugar-test'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory $tmp | Out-Null

$base = 'file:///' + ($root -replace '\\', '/') + '/'
$head = '<head><base href="' + $base + '"><script>' +
    'localStorage.clear(); localStorage.setItem("calc-rate", "20");' +       # старая ставка — калькулятор должен сменить на 22%
    'window.TEST_CASES = ' + $Cases + '; window.TEST_ERR = [];' +
    'window.addEventListener("error", function (e) { TEST_ERR.push(e.message + " @" + (e.filename || "").split("/").pop() + ":" + e.lineno); });' +
    'window.addEventListener("unhandledrejection", function (e) { TEST_ERR.push("Promise: " + e.reason); });' +
    'window.confirm = function () { return true; };' +                       # «Очистить архив?» — да
    '</script>'
$page = [IO.File]::ReadAllText((Join-Path $root 'index.html'))
$page = $page.Replace('<head>', $head).Replace('</body>', '<script src="tests/court-test.js"></script></body>')
$html = Join-Path $tmp 'test.html'
[IO.File]::WriteAllText($html, $page, (New-Object Text.UTF8Encoding $false))

Write-Host "Проверка: $Cases пробных заседаний, займёт около $([math]::Max(1, [math]::Ceiling($Cases / 100))) мин..."
$budget = 60000 * $Cases + 600000   # «виртуальное» время браузера: заседания идут без настоящих пауз
$dom = Join-Path $tmp 'out.html'
Start-Process $edge -ArgumentList '--headless=new', '--disable-gpu', '--allow-file-access-from-files',
    "--user-data-dir=$tmp\profile", '--force-prefers-reduced-motion', "--virtual-time-budget=$budget", '--dump-dom',
    ('file:///' + ($html -replace '\\', '/')) -Wait -NoNewWindow -RedirectStandardOutput $dom -RedirectStandardError (Join-Path $tmp 'edge.log')

$out = [IO.File]::ReadAllText($dom, [Text.Encoding]::UTF8)
$m = [regex]::Match($out, '(?s)<pre id="REPORT">(.*?)</pre>')
if (-not $m.Success) {
    $report = 'ЕСТЬ ОШИБКИ: проверка не дошла до отчёта (страница не загрузилась или зависла). Подробности: ' + $dom
} else {
    $report = [Net.WebUtility]::HtmlDecode($m.Groups[1].Value)
}
$report = 'Проверка от ' + (Get-Date).ToString('dd.MM.yyyy HH:mm') + "`r`n" + ($report -replace "`r?`n", "`r`n")
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'last-report.txt'), $report, (New-Object Text.UTF8Encoding $true))
Write-Host $report
if ($report -match 'ЕСТЬ ОШИБКИ') { exit 1 } else { exit 0 }