const { v4: uuidv4 } = require('uuid');

class Collection {
    constructor(name, baseUrl, token) {
        this.name = name;
        this.baseUrl = `${baseUrl}/data/${name}`;
        this.token = token;
    }

    // Helper Private untuk Request
    async _request(endpoint, method = 'GET', body = null) {
        const headers = {
            'Content-Type': 'application/json',
            'x-auth-token': this.token
        };

        const config = { method, headers };
        if (body) config.body = JSON.stringify(body);

        const url = endpoint ? `${this.baseUrl}/${endpoint}` : this.baseUrl;
        
        const res = await fetch(url, config);
        
        // Handle Error Text vs JSON
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Request failed");
            return data;
        } else {
            const text = await res.text();
            if (!res.ok) throw new Error(text || `Error ${res.status}`);
            return text;
        }
    }

    /**
     * Mencari banyak dokumen
     * @param {Object} query - Filter (contoh: { age: 20 })
     * @param {Object} options - { limit, sort, page }
     */
    async find(query = {}, options = {}) {
        // Convert query object ke URL Search Params
        const params = new URLSearchParams();
        
        // Handle Filtering dasar
        Object.keys(query).forEach(key => params.append(key, query[key]));
        
        // Handle Options
        if (options.limit) params.append('limit', options.limit);
        if (options.page) params.append('page', options.page);
        if (options.sort) params.append('sort', options.sort); // e.g. '-createdAt'

        const queryString = params.toString();
        const url = queryString ? `?${queryString}` : '';
        
        return await this._request(url, 'GET');
    }

    /**
     * Mencari satu dokumen
     */
    async findOne(query) {
        return await this._request('find-one', 'POST', query);
    }

    /**
     * Mencari berdasarkan ID
     */
    async findById(id) {
        return await this._request(id, 'GET');
    }

    /**
     * Menambah dokumen baru
     */
    async insert(doc) {
        // Auto generate ID jika tidak ada (konsistensi SDK)
        const payload = {
            _id: doc._id || uuidv4(),
            ...doc
        };
        return await this._request('', 'POST', payload);
    }

    /**
     * Menambah banyak dokumen (Bulk Import)
     */
    async insertMany(docs) {
        if (!Array.isArray(docs)) throw new Error("insertMany requires an array");
        return await this._request('import', 'POST', docs);
    }

    /**
     * Update dokumen berdasarkan ID
     */
    async update(id, updates) {
        return await this._request(id, 'PUT', updates);
    }

    /**
     * Hapus dokumen (Soft Delete default)
     * @param {string} id 
     * @param {boolean} permanent - Jika true, hapus permanen
     */
    async delete(id, permanent = false) {
        const endpoint = permanent ? `${id}?permanent=true` : id;
        return await this._request(endpoint, 'DELETE');
    }

    /**
     * Mengambil item di Trash Bin
     */
    async getTrash() {
        return await this._request('trash', 'GET');
    }

    /**
     * Restore item dari Trash
     */
    async restore(id) {
        return await this._request(`restore/${id}`, 'POST');
    }
}

module.exports = Collection;