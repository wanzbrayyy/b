const Collection = require('./Collection');

class WanzClient {
    /**
     * @param {string} email - Email akun WanzDB
     * @param {string} password - Password akun WanzDB
     * @param {string} [baseUrl] - Opsional, default ke Production
     */
    constructor(email, password, baseUrl = 'https://dbw-nu.vercel.app/api') {
        this.email = email;
        this.password = password;
        this.baseUrl = baseUrl;
        this.token = null;
        this.user = null;
    }

    /**
     * Melakukan autentikasi ke server WanzDB
     */
    async connect() {
        try {
            const res = await fetch(`${this.baseUrl}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: this.email, password: this.password })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.msg || data.error || 'Connection refused');
            }

            if (data.require2FA) {
                throw new Error("2FA is enabled. SDK does not support 2FA login yet. Please disable 2FA for API access.");
            }

            this.token = data.token;
            this.user = data.user;
            console.log(`✅ Connected to WanzDB Cluster as ${this.user.name}`);
            return this;
        } catch (error) {
            throw new Error(`WanzDB Connection Error: ${error.message}`);
        }
    }

    /**
     * Memilih Collection (Database Table)
     * @param {string} name - Nama collection
     */
    collection(name) {
        if (!this.token) {
            throw new Error("Client not connected. Call .connect() first.");
        }
        return new Collection(name, this.baseUrl, this.token);
    }

    /**
     * Mendapatkan daftar semua collection
     */
    async getCollections() {
        const res = await fetch(`${this.baseUrl}/data/collections`, {
            headers: { 'x-auth-token': this.token }
        });
        return await res.json();
    }
}

module.exports = WanzClient;