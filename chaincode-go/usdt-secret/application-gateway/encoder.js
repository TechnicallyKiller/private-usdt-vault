const {Jimp} = require('jimp');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// --- CONFIGURATION ---
const ROLE_NAME = "BankA"; 
const TARGET_ORG = "org1.example.com";
const INPUT_IMAGE = "input.png";
const OUTPUT_IMAGE = "AES_STEGO_BANK_A.png";
const ENCRYPTION_PASSWORD = "super_secret"; 
const MAGIC_HEADER = "FABRIC_GUARD:";      

// Paths
const homeDir = process.env.HOME;
const certPath = path.join(homeDir, 'fabric-samples', 'test-network', 'organizations', 'peerOrganizations', TARGET_ORG, 'users', `Admin@${TARGET_ORG}`, 'msp', 'signcerts', `Admin@${TARGET_ORG}-cert.pem`);

// AES Encryption
function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(ENCRYPTION_PASSWORD, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

async function hideData() {
    console.log(`🔒 Reading Certificate for ${ROLE_NAME}...`);
    const certContent = fs.readFileSync(certPath, 'utf8');

    console.log(`🛡️ Encrypting with AES-256...`);
    const encryptedData = encrypt(certContent);
    
    // Add Header and Terminator
    const payload = MAGIC_HEADER + encryptedData + "|END|";
    
    let binary = "";
    for (let i = 0; i < payload.length; i++) {
        binary += payload[i].charCodeAt(0).toString(2).padStart(8, '0');
    }

    console.log(`🖼️ Injecting ${binary.length} bits...`);
    
    const image = await Jimp.read(INPUT_IMAGE);
    
    if (binary.length > image.bitmap.width * image.bitmap.height) {
        throw new Error("Image too small! Use a larger PNG.");
    }

    let idx = 0;
    // LSB Injection
    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, i) {
        if (idx < binary.length) {
            let blue = this.bitmap.data[i + 2];
            if (binary[idx] === '1') blue = blue | 1;
            else blue = blue & ~1;
            this.bitmap.data[i + 2] = blue;
            idx++;
        }
    });

    image.write(OUTPUT_IMAGE, (err) => {
        if (err) throw err;
        console.log(`✅ SUCCESS: Created ${OUTPUT_IMAGE}`);
    });
}

hideData();