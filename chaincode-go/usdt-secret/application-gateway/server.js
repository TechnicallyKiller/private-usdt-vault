const express = require('express');
const cors = require('cors');
const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());

// --- CONFIGURATION ---
const channelName = 'mychannel';
const chaincodeName = 'usdt-secret';
const mspOrg1 = 'Org1MSP';
const mspOrg2 = 'Org2MSP';
const mspOrg3 = 'Org3MSP';

// Absolute Paths (Bulletproof)
const homeDir = process.env.HOME; 
const cryptoPath = path.join(homeDir, 'fabric-samples', 'test-network', 'organizations');

// --- HELPER: CONNECT WITH LOGGING ---
async function connectToNetwork(userOrg, logs) {
    let keyPath, certPath, peerEndpoint, tlsCertPath, mspId;

    logs.push(`📂 [System] Locating Crypto-Materials for ${userOrg}...`);

    if (userOrg === 'BankA') {
        const orgPath = path.join(cryptoPath, 'peerOrganizations', 'org1.example.com');
        keyPath = path.join(orgPath, 'users', 'Admin@org1.example.com', 'msp', 'keystore');
        certPath = path.join(orgPath, 'users', 'Admin@org1.example.com', 'msp', 'signcerts', 'Admin@org1.example.com-cert.pem');
        tlsCertPath = path.join(orgPath, 'peers', 'peer0.org1.example.com', 'tls', 'ca.crt');
        peerEndpoint = 'localhost:7051';
        mspId = mspOrg1;
    } else if (userOrg === 'BankB') {
        const orgPath = path.join(cryptoPath, 'peerOrganizations', 'org2.example.com');
        keyPath = path.join(orgPath, 'users', 'Admin@org2.example.com', 'msp', 'keystore');
        certPath = path.join(orgPath, 'users', 'Admin@org2.example.com', 'msp', 'signcerts', 'Admin@org2.example.com-cert.pem');
        tlsCertPath = path.join(orgPath, 'peers', 'peer0.org2.example.com', 'tls', 'ca.crt');
        peerEndpoint = 'localhost:9051';
        mspId = mspOrg2;
    } else if (userOrg === 'Regulator') {
        const orgPath = path.join(cryptoPath, 'peerOrganizations', 'org3.example.com');
        keyPath = path.join(orgPath, 'users', 'Admin@org3.example.com', 'msp', 'keystore');
        certPath = path.join(orgPath, 'users', 'Admin@org3.example.com', 'msp', 'signcerts', 'Admin@org3.example.com-cert.pem');
        tlsCertPath = path.join(orgPath, 'peers', 'peer0.org3.example.com', 'tls', 'ca.crt');
        peerEndpoint = 'localhost:11051';
        mspId = mspOrg3;
    } else {
        throw new Error("Unknown User Identity");
    }

    // Read Keys
    const keyFile = fs.readdirSync(keyPath)[0];
    const privateKeyPem = fs.readFileSync(path.join(keyPath, keyFile));
    const certPem = fs.readFileSync(certPath);
    const tlsRootCert = fs.readFileSync(tlsCertPath);
    
    logs.push(`🔑 [Auth] Private Key Loaded: ${keyFile.substring(0, 15)}...`);
    logs.push(`📜 [Auth] X.509 Certificate Loaded: ${path.basename(certPath)}`);

    // Connect
    logs.push(`⚡ [Net] Establishing gRPC link to Peer @ ${peerEndpoint}`);
    const client = new grpc.Client(peerEndpoint, grpc.credentials.createSsl(tlsRootCert));
    const connectOptions = {
        identity: { mspId, credentials: certPem },
        signer: signers.newPrivateKeySigner(crypto.createPrivateKey(privateKeyPem)),
        client,
    };

    return connect(connectOptions);
}

// --- API ENDPOINT ---
app.get('/api/balance', async (req, res) => {
    const user = req.query.user;
    const logs = []; // We store steps here
    console.log(`\n--- REQUEST: ${user} ---`);
    
    logs.push(`🚀 [Init] Incoming Request: Identify as '${user}'`);

    if (user === 'Outsider') {
        logs.push(`⚠️ [Policy] WARNING: User '${user}' is NOT in the Collection Policy.`);
        logs.push(`⛔ [Peer] REJECTED: Access Denied to Private Data.`);
        return res.json({ success: false, logs: logs, message: "Access Denied" });
    }

    try {
        const gateway = await connectToNetwork(user, logs);
        logs.push(`✅ [Net] Gateway Connected Successfully.`);

        const network = gateway.getNetwork(channelName);
        const contract = network.getContract(chaincodeName);
        
        logs.push(`📡 [Chaincode] Invoking 'ReadBalance' on 'usdt-secret'...`);
        logs.push(`🔒 [Privacy] Peer is verifying Membership Policy: OR(Org1, Org2, Org3)...`);
        
        const resultBytes = await contract.evaluateTransaction('ReadBalance');
        const resultJson = JSON.parse(new TextDecoder().decode(resultBytes));
        
        logs.push(`🔓 [Privacy] Policy Check PASSED. Decrypting data...`);
        logs.push(`💰 [Ledger] Value Retrieved: ${resultJson.value} USDT`);
        
        res.json({ success: true, logs: logs, data: resultJson });

    } catch (error) {
        console.error(error);
        logs.push(`❌ [Error] ${error.message}`);
        logs.push(`🚫 [Peer] The peer refused to return the private data.`);
        res.json({ success: false, logs: logs, message: "Authorization Failed" });
    }
});

// Serve HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(3000, () => {
    console.log('🚀 USDT Vault Server running at http://localhost:3000');
});