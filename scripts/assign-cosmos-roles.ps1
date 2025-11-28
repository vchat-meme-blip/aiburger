# --- START COPYING HERE ---
$ErrorActionPreference = "Stop"

# Configuration
$rgName = "rg-AIBurger-UK"
# The UUID for "Cosmos DB Built-in Data Contributor"
$roleId = "00000000-0000-0000-0000-000000000002" 

Write-Host "--- Starting Cosmos DB Role Assignment ---"

# 1. Find the Cosmos DB Account
Write-Host "1. Finding Cosmos DB Account in $rgName..."
$cosmosName = az cosmosdb list -g $rgName --query "[0].name" -o tsv

if (-not $cosmosName) { 
    Write-Error "CRITICAL: Could not find any Cosmos DB account in resource group $rgName"
    exit 1
}
Write-Host "   > Found Account: $cosmosName"

# 2. Function to assign role to a specific app
function Assign-RoleToApp($appPrefix) {
    Write-Host "`n2. Processing Function App ($appPrefix)..."
    
    # Find the app details
    $json = az functionapp list -g $rgName --query "[?starts_with(name, '$appPrefix')]" -o json
    $app = $json | ConvertFrom-Json
    
    if (-not $app) { 
        Write-Warning "   > No app found starting with '$appPrefix'. Skipping."
        return
    }
    
    # Handle array results (pick first)
    if ($app -is [array]) { $app = $app[0] }

    $appName = $app.name
    $principalId = $app.identity.principalId
    
    if (-not $principalId) {
        Write-Warning "   > App $appName has no Managed Identity (System Assigned). Skipping."
        return
    }

    Write-Host "   > Target App: $appName"
    Write-Host "   > Principal ID: $principalId"
    
    Write-Host "   > Assigning 'Cosmos DB Built-in Data Contributor'..."
    
    # Execute the assignment
    # We use --only-show-errors to keep output clean unless it fails
    az cosmosdb sql role assignment create `
        --account-name $cosmosName `
        --resource-group $rgName `
        --scope "/" `
        --principal-id $principalId `
        --role-definition-id $roleId `
        --only-show-errors
        
    Write-Host "   > Success."
}

# 3. Run for both apps
Assign-RoleToApp "func-agent-api"
Assign-RoleToApp "func-burger-api"

Write-Host "`n--- DONE ---"
Write-Host "Note: RBAC changes can take 5-15 minutes to propagate. If you get 403 errors immediately, just wait a bit."
# --- END COPYING HERE ---