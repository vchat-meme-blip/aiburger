<div align="center">

<img src="./packages/agent-webapp/public/favicon.png" alt="" align="center" height="64" />

# Chicha — The AI Burger Agent

[![Open in Codespaces](https://img.shields.io/badge/Codespaces-Open-blue?style=flat-square&logo=github)](https://codespaces.new/Azure-Samples/mcp-agent-langchainjs?hide_repo_select=true&ref=main&quickstart=true)
![Node version](https://img.shields.io/badge/Node.js->=22-3c873a?style=flat-square)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

**Chicha** is a production-ready AI Agent capable of bridging the gap between natural language and real-world food delivery logistics. Unlike simple chatbots, Chicha connects directly to delivery platforms (like Uber Eats) to manage the full lifecycle of a meal.

[Overview](#overview) • [Architecture](#architecture) • [Roadmap](#roadmap) • [Getting started](#getting-started) • [Deploy to Azure](#deploy-to-azure)

</div>

## Overview

This project demonstrates a serverless AI agent architecture using **LangChain.js** and the **Model Context Protocol (MCP)**. It is designed to move beyond simple text generation into "Agentic AI"—software that takes action.

### Core Capabilities (Live & Planned)
- **🧠 Context-Aware AI**: Remembers your dietary preferences and location.
- **🔌 Real Integrations**: Connects to Uber Eats Sandbox for live restaurant discovery.
- **📍 Geo-Location**: Uses browser geolocation for precise delivery targeting.
- **🛍️ Unified Ordering**: Abstracted ordering interface (simulated internal + external providers).

## Architecture

The system is composed of loosely coupled microservices:

| Service | Role | Tech |
| ------- | ---- | ---- |
| **Agent Web App** | The "Face". React/Lit UI that handles chat, geolocation, and auth. | Azure Static Web Apps |
| **Agent API** | The "Brain". LangChain.js orchestrator that decides *what* to do. | Azure Functions (Node.js) |
| **Burger MCP** | The "Hands". Standardized tool interface for the AI to touch APIs. | Azure Functions (MCP) |
| **Burger API** | The "Core". Business logic, database, and Uber Eats gateway. | Azure Functions + Cosmos DB |

## Roadmap: Building the Full "Chicha" Experience

We are actively moving from a demo to a full delivery assistant. See the [Chicha Technical Roadmap](./docs/CHICHA_ROADMAP.md) for the detailed engineering plan covering:

1.  **Live Courier Tracking** (Webhooks + Real-time Sockets)
2.  **Smart Scheduling** (Time-delayed execution)
3.  **Promo Hunter** (Vector-based deal discovery)
4.  **Cross-Platform Payment** (Crypto/Fiat bridging)

## Getting started

1. **Fork & Clone**: Get the code to your local machine.
2. **Install Dependencies**: `npm install`
3. **Start Local Stack**: `npm start` (Runs all 4 services + database emulators)
4. **Browse**: Open `http://localhost:4280`

## Deploy to Azure

The entire stack is defined in Infrastructure-as-Code (Bicep) for one-click deployment.

```bash
azd auth login
azd up
```

This will provision:
- Azure OpenAI (or connect to existing)
- Cosmos DB (Serverless)
- Azure Functions (Flex Consumption)
- Static Web Apps
- Application Insights

## Resources

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [LangChain.js](https://js.langchain.com)
- [Uber Eats API Docs](https://developer.uber.com/docs/eats/introduction)
