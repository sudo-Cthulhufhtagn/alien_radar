param(
    [Parameter(Mandatory = $true)]
    [string]$CoolifyDomain,

    [Parameter(Mandatory = $true)]
    [string]$AppUuid,

    [Parameter(Mandatory = $true)]
    [string]$Token,

    [switch]$Force
)

$forceParam = if ($Force) { "true" } else { "false" }
$uri = "https://$CoolifyDomain/api/v1/deploy?uuid=$AppUuid&force=$forceParam"
$headers = @{ Authorization = "Bearer $Token" }

Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
