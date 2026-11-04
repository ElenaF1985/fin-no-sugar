# Дописывает в data/rates.js официальные курсы ЦБ РФ (USD и EUR). Начало файла неизменно — 1 января 2023 года,
# старые курсы не удаляются: скрипт только добавляет новые дни в конец.
# Сайт берёт из этого файла курсы для плитки «Курс на дату» и кнопок «Период», «7 дней» и «14 дней» — без ожидания загрузки.
# Запуск: powershell -ExecutionPolicy Bypass -File update-rates.ps1

$root = $PSScriptRoot
$output = Join-Path $root 'data\rates.js'
$start = [datetime]'2023-01-01' # начало файла — не меняется
$codes = [ordered]@{ USD = 'R01235'; EUR = 'R01239' } # коды валют в системе ЦБ
$inv = [Globalization.CultureInfo]::InvariantCulture # точка в дробях, как в JS

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$today = Get-Date
$startDay = $start.ToString('yyyy-MM-dd')

# 1. Курсы, которые уже есть в файле: день → @{ USD; EUR }
$rates = @{}
if (Test-Path $output) {
    $old = [IO.File]::ReadAllText($output, [Text.Encoding]::UTF8)
    foreach ($m in [regex]::Matches($old, '\["(\d{4}-\d{2}-\d{2})", ([\d.]+), ([\d.]+)\]')) {
        $rates[$m.Groups[1].Value] = @{
            USD = [double]::Parse($m.Groups[2].Value, $inv)
            EUR = [double]::Parse($m.Groups[3].Value, $inv)
        }
    }
}
$oldDays = @($rates.Keys | Sort-Object)

# 2. С какой даты загружать.
# Файл уже начинается с 1 января 2023 — догружаем только хвост (последние 2 недели: вдруг ЦБ что-то поправил).
# Файла нет или он начинается позже — загружаем всё с 1 января 2023.
# Берём на 2 недели раньше 1 января: нужен курс, который действовал 1 января (ЦБ установил его в конце декабря).
if ($oldDays.Count -and $oldDays[0] -le $startDay) {
    $from = [datetime]$oldDays[-1]
    $from = $from.AddDays(-14)
} else {
    $from = $start.AddDays(-14)
}
$to = $today.AddDays(1) # ЦБ публикует курс на завтра уже сегодня днём

# 3. Один запрос на валюту — ЦБ сразу отдаёт весь период
$fresh = @{}
foreach ($code in $codes.Keys) {
    $url = "https://www.cbr.ru/scripts/XML_dynamic.asp?date_req1=$($from.ToString('dd/MM/yyyy'))&date_req2=$($to.ToString('dd/MM/yyyy'))&VAL_NM_RQ=$($codes[$code])"
    try {
        [xml]$xml = (Invoke-WebRequest -UseBasicParsing $url).Content
    } catch {
        Write-Host "Не удалось загрузить курсы $code с сайта ЦБ. Проверьте подключение к интернету. Файл не изменён."
        exit 1
    }
    foreach ($rec in $xml.ValCurs.Record) {
        # "08.09.2026" → "2026-09-08", "86,1909" за номинал → 86.1909 за единицу
        $day = [datetime]::ParseExact($rec.Date, 'dd.MM.yyyy', $inv).ToString('yyyy-MM-dd')
        $value = [double]::Parse($rec.Value.Replace(',', '.'), $inv) / [double]$rec.Nominal
        if (-not $fresh[$day]) { $fresh[$day] = @{} }
        $fresh[$day][$code] = $value
    }
}

# 4. Добавляем новые дни; в файл попадают только дни, на которые есть курс обеих валют
foreach ($day in $fresh.Keys) {
    if ($fresh[$day].Count -eq $codes.Count) { $rates[$day] = $fresh[$day] }
}

# До 1 января 2023 оставляем один день — курс, который действовал 1 января
$before = @($rates.Keys | Where-Object { $_ -lt $startDay } | Sort-Object)
if ($before.Count -gt 1) { $before[0..($before.Count - 2)] | ForEach-Object { $rates.Remove($_) } }

$days = @($rates.Keys | Sort-Object)
if (-not $days.Count) { Write-Host 'ЦБ не вернул курсов. Файл не изменён.'; exit 1 }

$lines = $days | ForEach-Object {
    $r = $rates[$_]
    '    ["' + $_ + '", ' + $r.USD.ToString('0.0####', $inv) + ', ' + $r.EUR.ToString('0.0####', $inv) + ']'
}

$js = @"
// Официальные курсы ЦБ РФ (USD и EUR) с 1 января 2023 года: [дата, USD, EUR] — только дни, когда ЦБ устанавливал курс.
// Первая строка — курс, который действовал 1 января 2023 (ЦБ установил его в конце декабря 2022).
// Файл пополняет скрипт update-rates.ps1 — вручную не править. Старые курсы не удаляются.
// Сайт берёт отсюда курсы для плитки «Курс на дату» и кнопок «Период», «7 дней» и «14 дней»; дни новее файла загружает из интернета.

window.RATES = {
  updated: "$($today.ToString('yyyy-MM-dd'))",
  days: [
$($lines -join ",`n")
  ]
};
"@

[IO.File]::WriteAllText($output, $js.Replace("`r`n", "`n"), (New-Object Text.UTF8Encoding $false))
$added = @($days | Where-Object { $oldDays -notcontains $_ }).Count
Write-Host "Готово. Добавлено дней: $added. Всего в файле: $($days.Count), с $($days[0]) по $($days[-1]). Файл: $output"
