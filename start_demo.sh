#!/bin/bash

# --- ⚠️ CRITICAL FIX: EXPORT GO PATH ---
# This ensures the script can find Go to package the chaincode
export PATH=$PATH:/usr/local/go/bin

# --- CONFIGURATION: ABSOLUTE PATHS ---
export BASE_DIR=$HOME/fabric-samples/test-network
export CODE_DIR=$HOME/fabric-samples/asset-transfer-private-data/chaincode-go/usdt-secret
export APP_DIR=$HOME/fabric-samples/asset-transfer-private-data/chaincode-go/usdt-secret/application-gateway

echo "🚀 INITIALIZING FULL VAULT (BANKS + REGULATOR)..."
echo "=================================================="

# 1. NAVIGATE TO NETWORK ROOT
cd $BASE_DIR

# 2. CLEANUP
echo "🧹 Cleaning up old network..."
./network.sh down
docker rm -f $(docker ps -aq) 2>/dev/null
docker volume prune -f >/dev/null

# 3. START BASIC NETWORK (Org1 + Org2)
echo "🌐 Starting Bank A and Bank B..."
./network.sh up createChannel -i 2.5.9

# 4. ADD THE REGULATOR (Org3)
echo "⚖️  Spinning up the Regulator Node..."
cd addOrg3
# Note: addOrg3.sh does NOT support the -i flag, so we run it plain
./addOrg3.sh up -c mychannel
cd $BASE_DIR

echo "⏳ Waiting 10 seconds for Org3 to fully sync..."
sleep 10

echo "✅ Network Fully Assembled (3 Orgs)."

# 5. DEPLOY SMART CONTRACT
echo "📜 Deploying Smart Contract with 3-Org Policy..."
# We use the -i flag here to ensure correct peer versions for deployment
./network.sh deployCC \
-ccn usdt-secret \
-ccp $CODE_DIR \
-ccl go \
-c mychannel \
-cccg $CODE_DIR/collections_config.json \
-i 2.5.9

echo "✅ Contract Deployed."

# 6. MINT THE MONEY
echo "💰 Minting 2.50 USDT..."

# Set Context to Bank A
export PATH=$HOME/fabric-samples/bin:$PATH
export FABRIC_CFG_PATH=$HOME/fabric-samples/config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=$BASE_DIR/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=$BASE_DIR/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

# Send Mint Transaction
peer chaincode invoke -o localhost:7050 \
--ordererTLSHostnameOverride orderer.example.com \
--tls --cafile "$BASE_DIR/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
-C mychannel -n usdt-secret \
--peerAddresses localhost:7051 --tlsRootCertFiles "$BASE_DIR/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
--peerAddresses localhost:9051 --tlsRootCertFiles "$BASE_DIR/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
-c '{"function":"Mint","Args":[]}'

echo "✅ Money Minted."
echo "=================================================="
echo "🎉 DEMO READY. STARTING WEB SERVER..."
echo "=================================================="

# 7. START WEB APP
cd $APP_DIR
node server.js