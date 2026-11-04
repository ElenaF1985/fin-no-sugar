# Обновляет список картинок и сохраняет очередь показа. Запуск вручную или через /news.
# Новые картинки вставляются перед началом следующего круга, начиная не раньше завтра.
# Сегодняшняя пара сохраняется, если её файлы не удалены.
$root = $PSScriptRoot
$dir = Join-Path $root 'pictures\humor'
$out = Join-Path $root 'data\humor.js'
$exts = @('.png', '.jpg', '.jpeg', '.webp', '.gif')
$names = @()
if (Test-Path $dir) {
    $names = @(Get-ChildItem -LiteralPath $dir -File |
        Where-Object { $exts -contains $_.Extension.ToLower() } |
        Sort-Object { [regex]::Replace($_.Name, '\d+', { $args[0].Value.PadLeft(10, '0') }) } |
        ForEach-Object { $_.Name })
}
$stages = @()
if (Test-Path $out) {
    $old = [IO.File]::ReadAllText($out, [Text.Encoding]::UTF8)
    $m = [regex]::Match($old, '(?s)window\.HUMOR_ROTATIONS\s*=\s*(\[.*?\]);')
    if ($m.Success) {
        $parsed = ConvertFrom-Json $m.Groups[1].Value
        $stages = @(foreach ($entry in $parsed) {
            [pscustomobject]@{ startDay = [int]$entry.startDay; boundary = [int]$entry.boundary; order = @($entry.order | ForEach-Object { [string]$_ }) }
        })
    }
    elseif ($old -match 'window\.HUMOR_PICTURES') {
        throw 'В списке нет сохранённой очереди. Сначала требуется перенос текущего порядка.'
    }
}
$now = Get-Date
$today = [int][math]::Floor(([datetime]::SpecifyKind($now.Date, [DateTimeKind]::Utc) - [datetime]'1970-01-01').TotalDays)
$tomorrow = $today + 1
$base = $stages | Where-Object { $_.startDay -le $tomorrow } | Sort-Object startDay | Select-Object -Last 1
if (-not $base) {
    $stages = @([pscustomobject]@{ startDay = $today; boundary = 0; order = @($names) })
} else {
    $previous = @($base.order)
    $added = @($names | Where-Object { $previous -cnotcontains $_ })
    $removed = @($previous | Where-Object { $names -cnotcontains $_ })
    if ($added.Count -or $removed.Count) {
        $queue = @()
        $beforeBoundary = @()
        if ($previous.Count) {
            $offset = (($tomorrow - [int]$base.startDay) * 2) % $previous.Count
            $distance = (([int]$base.boundary - $offset + $previous.Count) % $previous.Count)
            if ($distance -eq 0) { $distance = $previous.Count }
            for ($i = 0; $i -lt $previous.Count; $i++) {
                $name = $previous[($offset + $i) % $previous.Count]
                if ($names -ccontains $name) {
                    $queue += $name
                    if ($i -lt $distance) { $beforeBoundary += $name }
                }
            }
        }
        $newOrder = @($beforeBoundary) + @($added) + @($queue | Select-Object -Skip $beforeBoundary.Count)
        # Повторные обновления в один день заменяют завтрашний этап, не трогая сегодняшний.
        $stages = @($stages | Where-Object { $_.startDay -lt $tomorrow }) + @([pscustomobject]@{
            startDay = $tomorrow; boundary = $beforeBoundary.Count + $added.Count; order = @($newOrder)
        })
    }
}
$nameJson = ConvertTo-Json -InputObject @($names) -Depth 5
$stageJson = ConvertTo-Json -InputObject @($stages) -Depth 8
$nl = [Environment]::NewLine
$js = '// Список картинок и сохранённая очередь. Обновляет update-humor.ps1; вручную не редактировать.' + $nl +
    '// Обновлено: ' + $now.ToString('dd.MM.yyyy HH:mm') + $nl + $nl +
    'window.HUMOR_PICTURES = ' + $nameJson + ';' + $nl + $nl +
    'window.HUMOR_ROTATIONS = ' + $stageJson + ';' + $nl
[IO.File]::WriteAllText($out, $js.Replace("`r`n", "`n"), (New-Object Text.UTF8Encoding $false))
Write-Output ('Картинок для «Юмора»: ' + $names.Count + '. Файл: ' + $out)
