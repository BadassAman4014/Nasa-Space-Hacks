<#
.SYNOPSIS
    Convenience alias for .\run.ps1
#>
param(
    [switch]$SeparateWindows,
    [switch]$Stop,
    [switch]$NoBrowser
)

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
& "$PSScriptRoot\run.ps1" @PSBoundParameters
