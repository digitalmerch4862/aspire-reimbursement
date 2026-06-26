# Intentionally does not support password grant or Basic auth.
# Use device_code_flow.ps1 or an approved Microsoft OAuth app flow instead.
Write-Error "Password grant and Basic auth are disabled. Run .\device_code_flow.ps1 and complete MFA in the browser."
exit 1
