# 🏦 Private USDT Reserve Vault (Hyperledger Fabric)

A Proof-of-Concept (PoC) for a **Privacy-Preserving Stablecoin Reserve** system built on **Hyperledger Fabric v2.5**.

## 📖 The Problem
In traditional blockchains (like Ethereum), data is transparent to all participants. For institutional banking and Central Bank Digital Currencies (CBDCs), Banks cannot reveal their total liquidity or customer balances to competitors.

## 💡 The Solution
This project uses **Hyperledger Fabric Private Data Collections (PDC)** to ensure that:
1.  **Bank A** and **Bank B** can hold and verify assets.
2.  The **Regulator** has audit access to all transactions.
3.  **Unauthorized Outsiders** (other nodes on the network) cannot see the data—even though they store the ledger hashes.

## 🛠 Tech Stack
* **Network:** Hyperledger Fabric v2.5 (3 Organizations, Raft Consensus).
* **Infrastructure:** Docker & Docker Compose.
* **Smart Contract:** Go (Golang) with Private Data logic.
* **API Layer:** Node.js (Express + Fabric Gateway SDK).
* **Frontend:** HTML5 with Real-time WebSocket-style Logging.

## 🚀 Quick Start (Demo Mode)
This project includes an automated DevOps script to spin up the infrastructure, deploy chaincode, and initialize the ledger.

### Prerequisites
* Docker Desktop (Running)
* Node.js v18+
* Go v1.20+

### Installation & Launch
1.  Clone the repository and navigate to the network folder:
    ```bash
    cd ~/fabric-samples/test-network
    ```
2.  Run the Automation Script:
    ```bash
    ./start_demo.sh
    ```
    *This script will:*
    * Clean up old Docker containers.
    * Start 3 Peers (Bank A, Bank B, Regulator) and 1 Orderer.
    * Create a secure Channel (`mychannel`).
    * Deploy the `usdt-secret` Smart Contract with Endorsement Policies.
    * Mint **2.50 USDT** into the Private Data Collection.
    * Launch the Web API.

3.  **Access the Dashboard:**
    Open `http://localhost:3000` in your browser.

## 🏗 Architecture
* **Smart Contract (`usdt_vault.go`):** Uses `ctx.GetStub().PutPrivateData()` to store balances in a sideDB, bypassing the public block storage.
* **Collection Policy (`collections_config.json`):**
    ```json
    "policy": "OR('Org1MSP.member', 'Org2MSP.member', 'Org3MSP.member')"
    ```
    This ensures only the 3 whitelisted organizations possess the decryption keys.



---
*Built for the Hyperledger Fabric Developer assessment.*