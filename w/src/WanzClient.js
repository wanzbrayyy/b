const Collection = require('./Collection');

class WanzClient {
    constructor(identifier, passwordOrOptions) {
        this.identifier = identifier;
        this.password = passwordOrOptions;
        this.token = null;
        this.user = null;
        this.baseUrl = 'https://dbw-nu.vercel.app/api'; 

        if (identifier.startsWith('wanzdb://')) {
            this._parseConnectionString(identifier);
        }
    }

    _parseConnectionString(uri) {
        try {
            const fakeUrl = uri.replace('wanzdb://', 'http://');
            const parsed = new URL(fakeUrl);

            this.identifier = decodeURIComponent(parsed.username);
            this.password = decodeURIComponent(parsed.password); // Password di sini adalah UUID/API Key
            this.baseUrl = `https://${parsed.host}/api`;
            
            console.log("SDK Parsed Credentials:");
            console.log(`  > Identifier (User/Email): ${this.identifier}`);
            console.log(`  > Password: ${'*'.repeat(this.password.length)}`);
            console.log(`  > API Host: ${this.baseUrl}`);

        } catch (e) {
            throw new Error("Invalid WanzDB Connection String format.");
        }
    }

    async connect() {
        try {
            console.log(`🔌 Connecting to ${this.baseUrl}...`);
            
            // 🔥 LOGIC BARU: Deteksi jika password adalah UUID 50-digit/API Key
            // UUID 50-digit kita mengandung '_' dan sangat panjang
            const isApiKeyLogin = this.password.includes('_') && this.password.length > 40;

            const endpoint = isApiKeyLogin ? 'login-sdk' : 'login';
            
            const payload = isApiKeyLogin 
                ? { username: this.identifier, apiKey: this.password } // Kirim apiKey ke endpoint khusus
                : { email: this.identifier, password: this.password }; // Kirim password biasa

            const res = await fetch(`${this.baseUrl}/auth/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.msg || data.error || `Connection refused (Status: ${res.status})`);
            }

            if (data.require2FA) {
                throw new Error("2FA is enabled. Login via Connection String not supported.");
            }

            this.token = data.token;
            this.user = data.user;
            console.log(`✅ Connected as [${this.user.name}]`);
            return this;
        } catch (error) {
            throw new Error(`WanzDB Error: ${error.message}`);
        }
    }

    collection(name) {
        if (!this.token) {
            throw new Error("Client not connected. Call .connect() first.");
        }
        return new Collection(name, this.baseUrl, this.token);
    }
}

module.exports = WanzClient;