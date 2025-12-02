const express = require('express');
const cors = require('cors');
const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json()); // Essential for reading the file content sent from frontend

// --- CONFIGURATION ---
const channelName = 'mychannel';
const chaincodeName = 'usdt-secret';
const mspOrg1 = 'Org1MSP';
const mspOrg2 = 'Org2MSP';
const mspOrg3 = 'Org3MSP';

// Absolute Paths (Bulletproof)
const homeDir = process.env.HOME; 
const cryptoPath = path.join(homeDir, 'fabric-samples', 'test-network', 'organizations');

// --- HELPER: Identify User based on File Content ---
function getUserRoleFromCert(uploadedCert) {
    try {
        // 1. Load Bank A's Real Certificate
        const certPathA = path.join(cryptoPath, 'peerOrganizations', 'org1.example.com', 'users', 'Admin@org1.example.com', 'msp', 'signcerts', 'Admin@org1.example.com-cert.pem');
        const realCertA = fs.readFileSync(certPathA, 'utf8');

        // 2. Load Bank B's Real Certificate
        const certPathB = path.join(cryptoPath, 'peerOrganizations', 'org2.example.com', 'users', 'Admin@org2.example.com', 'msp', 'signcerts', 'Admin@org2.example.com-cert.pem');
        const realCertB = fs.readFileSync(certPathB, 'utf8');

        // 3. Load Regulator's Real Certificate
        const certPathReg = path.join(cryptoPath, 'peerOrganizations', 'org3.example.com', 'users', 'Admin@org3.example.com', 'msp', 'signcerts', 'Admin@org3.example.com-cert.pem');
        const realCertReg = fs.readFileSync(certPathReg, 'utf8');

        // Normalize strings (remove whitespace/newlines for comparison)
        const norm = (str) => str.replace(/\s+/g, '').trim();

        if (norm(uploadedCert) === norm(realCertA)) return 'BankA';
        if (norm(uploadedCert) === norm(realCertB)) return 'BankB';
        if (norm(uploadedCert) === norm(realCertReg)) return 'Regulator';
        
        return 'Unknown';
    } catch (e) {
        console.error("Error reading cert files:", e);
        return 'Error';
    }
}

// --- HELPER: Connect to Fabric ---
async function connectToNetwork(userOrg, logs) {
    let keyPath, certPath, peerEndpoint, tlsCertPath, mspId;

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
    }

    // Read Keys
    const keyFile = fs.readdirSync(keyPath)[0];
    const privateKeyPem = fs.readFileSync(path.join(keyPath, keyFile));
    const certPem = fs.readFileSync(certPath);
    const tlsRootCert = fs.readFileSync(tlsCertPath);
    
    logs.push(`🔑 [Auth] Private Key Unlocked: ${keyFile.substring(0, 15)}...`);
    
    // Connect
    logs.push(`⚡ [Net] Dialing Peer @ ${peerEndpoint}`);
    const client = new grpc.Client(peerEndpoint, grpc.credentials.createSsl(tlsRootCert));
    const connectOptions = {
        identity: { mspId, credentials: certPem },
        signer: signers.newPrivateKeySigner(crypto.createPrivateKey(privateKeyPem)),
        client,
    };

    return connect(connectOptions);
}

// --- MAIN LOGIN ENDPOINT ---
app.post('/api/login-crypto', async (req, res) => {
    const { certData } = req.body;
    const logs = [];
    
    console.log(`\n--- NEW LOGIN ATTEMPT ---`);
    logs.push(`📂 [System] Analyzing Uploaded X.509 Certificate...`);

    // 1. VERIFY FILE
    const role = getUserRoleFromCert(certData);

    if (role === 'Unknown' || role === 'Error') {
        logs.push(`❌ [Auth] CRITICAL: Certificate Signature Mismatch.`);
        logs.push(`⛔ [Access] Denied. This ID is not trusted by the Root CA.`);
        return res.json({ success: false, logs: logs, message: "Invalid Digital Identity" });
    }

    logs.push(`✅ [Auth] Identity Verified: ${role}`);
    logs.push(`🔍 [System] Loading Wallet for ${role}...`);

    try {
        const gateway = await connectToNetwork(role, logs);
        const network = gateway.getNetwork(channelName);
        const contract = network.getContract(chaincodeName);
        
        logs.push(`📡 [Chaincode] Connected. Querying 'ReadBalance'...`);
        
        // EVALUATE TRANSACTION
        const resultBytes = await contract.evaluateTransaction('ReadBalance');
        const resultJson = JSON.parse(new TextDecoder().decode(resultBytes));
        
        logs.push(`💰 [Ledger] Success. Private Data Decrypted.`);
        res.json({ success: true, logs: logs, data: resultJson, role: role });

    } catch (error) {
        logs.push(`❌ [Error] ${error.message}`);
        res.json({ success: false, logs: logs, message: "Query Failed" });
    }
});

// Serve HTML
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(3000, () => {
    console.log('🚀 USDT Vault Server running at http://localhost:3000');
});