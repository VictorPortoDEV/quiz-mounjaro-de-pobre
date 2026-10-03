$ErrorActionPreference = 'Stop'

$pagePath = Join-Path $PSScriptRoot '..\pages\obrigado\index.html'
$html = Get-Content -Raw $pagePath

$requiredSnippets = @(
  'href="https://mounjarodpobre.ticto.club/"'
  'Acessar o portal'
  'O acesso foi enviado por e-mail'
  'spam'
  'lixo eletrônico'
  'mailto:suporte@mounjarodpobre.com.br'
)

foreach ($snippet in $requiredSnippets) {
  if ($html -notlike "*$snippet*") {
    throw "Missing required snippet: $snippet"
  }
}

Write-Output 'PASS: thank-you page contains the portal CTA and support instructions.'
