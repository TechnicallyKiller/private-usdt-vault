const express = require('express');
const cors = require('cors');
const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {Jimp} = require('jimp');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- CONFIG ---
const channelName = 'mychannel';
const chaincodeName = 'usdt-secret';
const ENCRYPTION_PASSWORD = "super_secret";
const MAGIC_HEADER = "FABRIC_GUARD:";

const homeDir = process.env.HOME; 
const cryptoPath = path.join(homeDir, 'fabric-samples', 'test-network', 'organizations');

// --- HELPER: AES Decrypt ---
function decrypt(text) {
    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const key = crypto.scryptSync(ENCRYPTION_PASSWORD, 'salt', 32);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) { return null; }
}

// --- HELPER: Identify User ---
function getUserRoleFromCert(certString) {
    try {
        const certA = fs.readFileSync(path.join(cryptoPath, 'peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/signcerts/Admin@org1.example.com-cert.pem'), 'utf8');
        const certB = fs.readFileSync(path.join(cryptoPath, 'peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp/signcerts/Admin@org2.example.com-cert.pem'), 'utf8');
        const certReg = fs.readFileSync(path.join(cryptoPath, 'peerOrganizations/org3.example.com/users/Admin@org3.example.com/msp/signcerts/Admin@org3.example.com-cert.pem'), 'utf8');

        const norm = (str) => str.replace(/\s+/g, '').trim();
        const target = norm(certString);

        if (target === norm(certA)) return { role: 'BankA', msp: 'Org1MSP', port: 7051, org: 'org1.example.com' };
        if (target === norm(certB)) return { role: 'BankB', msp: 'Org2MSP', port: 9051, org: 'org2.example.com' };
        if (target === norm(certReg)) return { role: 'Regulator', msp: 'Org3MSP', port: 11051, org: 'org3.example.com' };
        return null;
    } catch (e) { return null; }
}

async function connectToNetwork(user) {
    const keyPath = path.join(cryptoPath, `peerOrganizations/${user.org}/users/Admin@${user.org}/msp/keystore`);
    const keyFile = fs.readdirSync(keyPath)[0];
    const privateKey = fs.readFileSync(path.join(keyPath, keyFile));
    const certPath = path.join(cryptoPath, `peerOrganizations/${user.org}/users/Admin@${user.org}/msp/signcerts/Admin@${user.org}-cert.pem`);
    const cert = fs.readFileSync(certPath);
    const tlsCert = fs.readFileSync(path.join(cryptoPath, `peerOrganizations/${user.org}/peers/peer0.${user.org}/tls/ca.crt`));

    const client = new grpc.Client(`localhost:${user.port}`, grpc.credentials.createSsl(tlsCert));
    return connect({ identity: { mspId: user.msp, credentials: cert }, signer: signers.newPrivateKeySigner(crypto.createPrivateKey(privateKey)), client });
}

// --- OPTIMIZED PIXEL EXTRACTOR ---
async function extractHiddenData(imageBuffer) {
    return new Promise(async (resolve, reject) => {
        try {
            const image = await Jimp.read(imageBuffer);
            let binary = "";
            let text = "";
            const width = image.bitmap.width;
            const height = image.bitmap.height;
            const data = image.bitmap.data;
            const totalPixels = width * height;

            let i = 0;
            
            function processChunk() {
                const start = Date.now();
                
                while (i < totalPixels && Date.now() - start < 15) {
                    const blue = data[i * 4 + 2]; 
                    binary += (blue & 1);

                    
                    if (binary.length % 8 === 0) {
                        const byte = binary.slice(binary.length - 8);
                        const char = String.fromCharCode(parseInt(byte, 2));
                        text += char;

                       
                        if (text.length === MAGIC_HEADER.length) {
                            if (text !== MAGIC_HEADER) {
                                return resolve(null); 
                            }
                        }

                        if (text.endsWith("|END|")) {
                            return resolve(text.replace(MAGIC_HEADER, "").replace("|END|", ""));
                        }
                    }
                    i++;
                }

                if (i < totalPixels) {
                    setImmediate(processChunk);
                } else {
                    resolve(null);
                }
            }
            processChunk();
        } catch (e) { reject(e); }
    });
}

// --- API ENDPOINT ---
app.post('/api/stego-login', async (req, res) => {
    const { imageData } = req.body;
    const logs = [];
    logs.push(`🔬 [Stego] Scanning Pixels (Optimized)...`);

    try {
        const buffer = Buffer.from(imageData.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        const encryptedText = await extractHiddenData(buffer);

        if (!encryptedText) {
            logs.push(`❌ [Stego] No Valid Header found.`);
            return res.json({ success: false, logs, message: "Invalid / Clean Image" });
        }

        logs.push(`🛡️ [Crypto] Payload Found. Decrypting...`);
        const decryptedCert = decrypt(encryptedText);

        if (!decryptedCert) {
            logs.push(`❌ [Crypto] Decryption Failed (Wrong Password).`);
            return res.json({ success: false, logs, message: "Decryption Error" });
        }

        logs.push(`✅ [Crypto] Decrypted.`);
        const user = getUserRoleFromCert(decryptedCert);

        if (!user) {
            logs.push(`⛔ [Auth] Unauthorized Identity.`);
            return res.json({ success: false, logs, message: "Unauthorized" });
        }

        logs.push(`👤 [Auth] Verified: ${user.role}`);
        const gateway = await connectToNetwork(user);
        const network = gateway.getNetwork(channelName);
        const contract = network.getContract(chaincodeName);
        
        const resultBytes = await contract.evaluateTransaction('ReadBalance');
        const resultJson = JSON.parse(new TextDecoder().decode(resultBytes));

        logs.push(`💰 [Vault] Balance: ${resultJson.value} USDT`);
        res.json({ success: true, logs, data: resultJson, role: user.role });

    } catch (e) {
        logs.push(`❌ [Error] ${e.message}`);
        res.json({ success: false, logs });
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(3000, () => console.log('🚀 Optimized Stego-Server running at http://localhost:3000'));