
# Azure Post-Deployment Configuration Guide

**Target Resource Group:** `rg-AIBurger-UK`
**Location:** `uksouth` (UK South)

---

## 1. Configure Azure OpenAI (AI Foundry)

If `azd up` did not automatically create the model deployment, or if you are connecting to an existing resource, follow these steps.

### A. Verify/Create Resource
1. Go to the [Azure Portal](https://portal.azure.com).
2. Search for **Azure OpenAI**.
3. If `cosychiruka-1347-resource` exists, click it.
   * *If not:* Click **Create**, select `rg-AIBurger-UK`, name it `cosychiruka-1347-resource`, region `UK South` (or `East US` if models aren't available in UK), and `Standard S0` tier.

### B. Deploy the Model
1. Inside the OpenAI resource, click the button **"Go to Azure AI Foundry portal"** (or Model Deployments).
2. On the left sidebar, click **Deployments** (or "Models").
3. Click **+ Deploy model** > **Deploy base model**.
4. Search for **`gpt-4o-mini`** (or `gpt-4o` if you prefer/have quota).
5. Select it and click **Confirm**.
6. **IMPORTANT:** In the deployment details:
   * **Deployment Name:** `gpt-4o-mini` (This **MUST** match the `AZURE_OPENAI_MODEL` env var in your Agent API).
   * Click **Deploy**.

---

## 2. Create and Link Web PubSub

This service handles the real-time order updates. It likely does not exist yet.

### A. Create Resource
1. In Azure Portal, search for **Web PubSub**.
2. Click **Create**.
3. **Resource Group:** `rg-AIBurger-UK`.
4. **Resource Name:** `pubsub-burger-uk` (or similar unique name).
5. **Region:** `UK South`.
6. **Tier:** **Free (Standard_F1)** (sufficient for dev/demo) or Standard.
7. Click **Review + create** -> **Create**.

### B. Get Connection String
1. Once created, go to the resource.
2. On the left menu, under **Settings**, click **Keys**.
3. Copy the **Primary Connection String**.

### C. Link to Burger API
1. Go to your **Burger API Function App**: `func-burger-api-lf6kch3t2wm3e`.
2. On the left menu, click **Environment variables**.
3. Click **+ Add**.
   * **Name:** `AZURE_WEBPUBSUB_CONNECTION_STRING`
   * **Value:** *(Paste the connection string from step B)*
4. Click **Apply**, then **Apply** (or Restart) at the top to save changes.

---

## 3. Identity & Role Assignments (Linking Apps)

This allows your apps to talk to databases and AI without passwords ("Managed Identity").

### A. Link Agent API to Azure OpenAI
1. Go to your **Azure OpenAI Resource** (`cosychiruka-1347-resource`).
2. Click **Access control (IAM)** on the left.
3. Click **+ Add** -> **Add role assignment**.
4. **Role:** Search for and select **`Cognitive Services OpenAI User`**. Click Next.
5. **Members:**
   * Select **Managed Identity**.
   * Click **+ Select members**.
   * Managed identity: Select **Function App**.
   * Select **`func-agent-api-lf6kch3t2wm3e`**.
   * Click **Select**.
6. Click **Review + assign**.

### B. Link Agent API & Burger API to Cosmos DB
* **Goal:** Allow apps to read/write data.
1. Go to your **Azure Cosmos DB Account** (`cosmos-lf6kch3t2wm3e`).
2. Click **Access control (IAM)**.
3. Click **+ Add** -> **Add role assignment**.
4. **Role:** Search for **`Cosmos DB Built-in Data Contributor`**. Click Next.
   * *Note: If you don't see this role, you might need to use the [Cosmos DB specific Role assignment command via CLI](https://learn.microsoft.com/azure/cosmos-db/nosql/security/how-to-grant-data-plane-role-rbac), but check the portal first.*
5. **Members:**
   * Select **Managed Identity**.
   * Click **+ Select members**.
   * Select **Function App**.
   * Select **BOTH** `func-agent-api-lf6kch3t2wm3e` **AND** `func-burger-api-lf6kch3t2wm3e`.
   * Click **Select**.
6. Click **Review + assign**.

The "Built-in Data Contributor" role is hidden in the standard IAM list. You **MUST** run the script below to apply it.

1. Open your terminal in the project root.
2. Run the following command:
   ```powershell
   ./scripts/assign-cosmos-roles.ps1
   ```
   *(This script finds your Cosmos DB and assigns the permission to both the Agent API and Burger API)*

### C. Link Burger API to Blob Storage
1. Go to your **Storage Account** (`stlf6kch3t2wm3e`).
2. Click **Access control (IAM)**.
3. Click **+ Add** -> **Add role assignment**.
4. **Role:** Search for **`Storage Blob Data Contributor`**. Click Next.
5. **Members:**
   * Select **Managed Identity**.
   * Click **+ Select members**.
   * Select **Function App**.
   * Select **`func-burger-api-lf6kch3t2wm3e`**.
   * Click **Select**.
6. Click **Review + assign**.

---

## 4. Verify Environment Variables

Ensure your **Agent API** (`func-agent-api-lf6kch3t2wm3e`) has the following Environment Variables set in the portal:

1. `AZURE_OPENAI_API_ENDPOINT`: `https://cosychiruka-1347-resource.cognitiveservices.azure.com/`
2. `AZURE_OPENAI_MODEL`: `gpt-4o-mini` (Must match deployment name from Step 1.B).
3. `BURGER_API_URL`: `https://func-burger-api-lf6kch3t2wm3e.azurewebsites.net`
4. `BURGER_MCP_URL`: `https://func-burger-mcp-lf6kch3t2wm3e.azurewebsites.net/mcp`

---

## 5. Final Verification

1. Restart both Function Apps (`func-agent-api...` and `func-burger-api...`) in the Azure Portal.
2. Open the **Burger WebApp** (`https://white-hill-01ed40c0f.3.azurestaticapps.net`).
3. Open the **Agent WebApp** (`https://gentle-mud-07094ba0f.3.azurestaticapps.net`).
4. Login.
5. Type "Hi" in the chat. The agent should respond.
