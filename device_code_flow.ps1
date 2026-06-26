# Device code flow - allows authentication without browser redirect
$body = @{
    client_id = "9199bf20-a13f-4107-85dc-02114787ef48"
    scope = "https://outlook.office.com/.default offline_access openid profile"
    response_type = "device_code"
} 

try {
    $resp = Invoke-RestMethod -Uri "https://login.microsoftonline.com/common/oauth2/v2.0/devicecode" `
        -Method POST `
        -ContentType "application/x-www-form-urlencoded" `
        -Body $body
    Write-Output "Device code response:"
    $resp | ConvertTo-Json | Format-List
    
    if ($resp.device_code) {
        Write-Output "`n== ACTION REQUIRED =="
        Write-Output "1. Open this URL in your browser: $($resp.verification_url)"
        Write-Output "2. Enter this code: $($resp.user_code)"
        Write-Output "3. Log in with the approved mailbox account and complete MFA"
        Write-Output "4. Come back here and press Enter"
        
        # Save device code for polling
        $resp | ConvertTo-Json | Out-File -FilePath "C:/Users/Admin/Desktop/App/Aspire Reimbursement/device_code.json" -Encoding UTF8
    }
} catch {
    Write-Output "Device code flow failed: $($_.Exception.Message)"
}
