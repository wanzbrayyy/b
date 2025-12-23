const Collection = require('./Collection');

class WanzClient {
    /**
     * Constructor support 2 mode:
     * 1. Connection String: new WanzClient('wanzdb://user:pass@host/...')
     * 2. Manual: new WanzClient('email', 'pass')
     */
    constructor(identifier, passwordOrOptions) {
        this.token = null;
        this.user = null;
        this.baseUrl = 'https://dbw-nu.vercel.app/api'; // Default Production

        // Mode 1: Connection String
        if (identifier.startsWith('wanzdb://')) {
            this._parseConnectionString(identifier);
        } 
        // Mode 2: Manual Email & Password
        else {
            this.identifier = identifier;
            this.password = passwordOrOptions;
        }
    }

    /**
     * Parsing wanzdb://username:password@host/options
     */
    _parseConnectionString(uri) {
        try {
            // Trik: Ganti protokol ke http agar bisa diparse oleh URL API bawaan Node.js
            const fakeUrl = uri.replace('wanzdb://', 'http://');
            const parsed = new URL(fakeUrl);

            this.identifier = decodeURIComponent(parsed.username);
            this.password = decodeURIComponent(parsed.password);
            
            // Ambil host dari connection string (agar dinamis)
            // Hapus trailing slash jika ada
            const host = parsed.host;
            this.baseUrl = `https://${host}/api`;

            // Opsional: Baca params seperti ?w=majority (untuk masa depan)
            // const options = parsed.searchParams; 
        } catch (e) {
            throw new Error("Invalid WanzDB Connection String format.");
        }
    }

    /**
     * Connect ke Database
     */
    async connect() {
        try {
            console.log(`🔌 Connecting to ${this.baseUrl}...`);
            
            // Login ke Backend
            // Note: Body kirim 'email' tapi isinya bisa username (karena update backend tadi)
            const res = await fetch(`${this.baseUrl}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: this.identifier, password: this.password })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.msg || data.error || 'Connection refused');
            }

            if (data.require2FA) {
                throw new Error("2FA is enabled. SDK login via Connection String does not support 2FA yet.");
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