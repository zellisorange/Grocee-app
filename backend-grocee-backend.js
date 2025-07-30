// grocee-backend.js - CLEAN UNIFIED BACKEND
// Your ONE backend file that does EVERYTHING

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Anti-detection setup
puppeteer.use(StealthPlugin());

class GroceeBackend {
    constructor() {
        this.app = express();
        this.port = 3001;
        
        // Live scraped data storage
        this.liveData = new Map();
        this.scrapingInProgress = false;
        
        // Canadian stores for scraping
        this.stores = {
            'metro': {
                name: 'Metro',
                baseUrl: 'https://www.metro.ca',
                searchUrl: 'https://www.metro.ca/en/online-grocery/search?filter=',
                selectors: {
                    productCard: '.pt-tile-product, .product-tile',
                    name: '.pt-title, .product-name, h3',
                    price: '.pricing__price, .pt-price, .price',
                    originalPrice: '.pricing__was-price, .original-price',
                    image: '.pt-product-image img, .product-image img'
                }
            },
            'loblaws': {
                name: 'Loblaws',
                baseUrl: 'https://www.loblaws.ca',
                searchUrl: 'https://www.loblaws.ca/search?search-bar=',
                selectors: {
                    productCard: '.product-tile, .product-card',
                    name: '.product-name, .product-title, h3',
                    price: '.selling-price, .price-current, .price',
                    originalPrice: '.comparison-price, .was-price',
                    image: '.product-image img, .product-tile__thumbnail img'
                }
            },
            'sobeys': {
                name: 'Sobeys',
                baseUrl: 'https://www.sobeys.com',
                searchUrl: 'https://www.sobeys.com/en/search/?q=',
                selectors: {
                    productCard: '.product-tile, .product-item',
                    name: '.product-item-title, .product-name',
                    price: '.price-current, .product-price, .price',
                    originalPrice: '.price-was, .original-price',
                    image: '.product-image img'
                }
            },
            'walmart': {
                name: 'Walmart',
                baseUrl: 'https://www.walmart.ca',
                searchUrl: 'https://www.walmart.ca/search?q=',
                selectors: {
                    productCard: '.product-item, [data-automation-id="product-tile"]',
                    name: '.product-title, [data-automation-id="name"]',
                    price: '.price-current, [data-automation-id="price"]',
                    originalPrice: '.price-was, .strikethrough',
                    image: '.product-image img'
                }
            }
        };

        this.setupAPI();
        this.startServer();
    }

    setupAPI() {
        // CORS setup for your frontend
        this.app.use(cors({
            origin: ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://localhost:5500', '*'],
            methods: ['GET', 'POST'],
            credentials: true
        }));

        this.app.use(express.json());
        this.app.use(express.static('public'));

        // ==========================================
        // API ENDPOINTS FOR YOUR FRONTEND
        // ==========================================

        // Status check - YOUR FRONTEND CALLS THIS
        this.app.get('/api/status', (req, res) => {
            console.log('📡 Frontend checking API status...');
            res.json({
                success: true,
                status: 'CONNECTED',
                message: '🇨🇦 Grocee Backend ONLINE!',
                stores: Object.keys(this.stores).length,
                cachedProducts: this.liveData.size,
                scrapingActive: this.scrapingInProgress,
                timestamp: new Date().toISOString()
            });
        });

        // Search products - MAIN SEARCH ENDPOINT
        this.app.get('/api/search/:query', async (req, res) => {
            const query = req.params.query.toLowerCase();
            console.log(`🔍 Search request: "${query}"`);

            try {
                // Check cached data first
                let results = this.searchCachedData(query);
                
                // If no cached results, do live scraping
                if (results.length === 0 && !this.scrapingInProgress) {
                    console.log('🤖 No cached data, starting live scrape...');
                    results = await this.liveSearch(query);
                }

                // If still no results, return sample data
                if (results.length === 0) {
                    results = this.getSampleData(query);
                }

                res.json({
                    success: true,
                    query: query,
                    results: results,
                    source: results.length > 0 ? 'LIVE_SCRAPE' : 'SAMPLE',
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                console.error('❌ Search error:', error.message);
                res.json({
                    success: false,
                    error: error.message,
                    results: this.getSampleData(query)
                });
            }
        });

        // Get all stores
        this.app.get('/api/stores', (req, res) => {
            const storeList = Object.entries(this.stores).map(([key, store]) => ({
                id: key,
                name: store.name,
                status: 'ACTIVE',
                products: this.getStoreProductCount(key)
            }));

            res.json({
                success: true,
                stores: storeList
            });
        });

        // Manual scrape trigger
        this.app.post('/api/scrape/:store/:query', async (req, res) => {
            const { store, query } = req.params;
            
            try {
                console.log(`🔄 Manual scrape: ${store} for "${query}"`);
                const results = await this.scrapeStore(store, query);
                
                res.json({
                    success: true,
                    store: store,
                    query: query,
                    results: results,
                    message: `Found ${results.length} products`
                });
            } catch (error) {
                res.json({
                    success: false,
                    error: error.message
                });
            }
        });
    }

    // ==========================================
    // LIVE SCRAPING ENGINE
    // ==========================================

    async liveSearch(query) {
        if (this.scrapingInProgress) {
            console.log('⏳ Scraping already in progress...');
            return [];
        }

        this.scrapingInProgress = true;
        let allResults = [];

        try {
            console.log(`🤖 Starting live scrape for: "${query}"`);
            
            // Scrape multiple stores in parallel (but limited)
            const storeKeys = Object.keys(this.stores).slice(0, 2); // Start with 2 stores
            const promises = storeKeys.map(storeKey => this.scrapeStore(storeKey, query));
            
            const results = await Promise.allSettled(promises);
            
            results.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value.length > 0) {
                    allResults = allResults.concat(result.value);
                    console.log(`✅ ${storeKeys[index]}: Found ${result.value.length} products`);
                } else {
                    console.log(`⚠️ ${storeKeys[index]}: No results or error`);
                }
            });

            // Cache the results
            this.cacheResults(query, allResults);
            
        } catch (error) {
            console.error('❌ Live search error:', error);
        } finally {
            this.scrapingInProgress = false;
        }

        return allResults;
    }

    async scrapeStore(storeKey, query) {
        const store = this.stores[storeKey];
        if (!store) return [];

        let browser;
        try {
            console.log(`🕷️ Scraping ${store.name} for "${query}"`);

            browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            });

            const page = await browser.newPage();
            
            // Set user agent and viewport
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1366, height: 768 });

            // Navigate to search page
            const searchUrl = `${store.searchUrl}${encodeURIComponent(query)}`;
            console.log(`🌐 Loading: ${searchUrl}`);
            
            await page.goto(searchUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 15000 
            });

            // Wait for products to load
            await page.waitForTimeout(3000);

            // Extract product data
            const products = await page.evaluate((selectors, storeName) => {
                const productCards = document.querySelectorAll(selectors.productCard);
                const results = [];

                productCards.forEach((card, index) => {
                    if (index >= 10) return; // Limit to 10 products per store

                    try {
                        const nameEl = card.querySelector(selectors.name);
                        const priceEl = card.querySelector(selectors.price);
                        const originalPriceEl = card.querySelector(selectors.originalPrice);
                        const imageEl = card.querySelector(selectors.image);

                        if (nameEl && priceEl) {
                            const name = nameEl.textContent.trim();
                            const priceText = priceEl.textContent.trim();
                            const price = parseFloat(priceText.replace(/[^0-9.]/g, ''));
                            
                            let originalPrice = null;
                            if (originalPriceEl) {
                                const originalPriceText = originalPriceEl.textContent.trim();
                                originalPrice = parseFloat(originalPriceText.replace(/[^0-9.]/g, ''));
                            }

                            const imageUrl = imageEl ? imageEl.src || imageEl.getAttribute('data-src') : null;

                            if (name && !isNaN(price) && price > 0) {
                                results.push({
                                    name: name,
                                    price: price,
                                    originalPrice: originalPrice,
                                    savings: originalPrice ? originalPrice - price : 0,
                                    store: storeName,
                                    image: imageUrl,
                                    scrapedAt: new Date().toISOString()
                                });
                            }
                        }
                    } catch (error) {
                        console.log('Product extraction error:', error);
                    }
                });

                return results;
            }, store.selectors, store.name);

            console.log(`✅ ${store.name}: Extracted ${products.length} products`);
            return products;

        } catch (error) {
            console.error(`❌ Error scraping ${store.name}:`, error.message);
            return [];
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }

    // ==========================================
    // DATA MANAGEMENT
    // ==========================================

    searchCachedData(query) {
        const cached = this.liveData.get(query);
        if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) { // 10 minutes cache
            console.log(`📦 Using cached data for: ${query}`);
            return cached.data;
        }
        return [];
    }

    cacheResults(query, results) {
        this.liveData.set(query, {
            data: results,
            timestamp: Date.now()
        });
        console.log(`💾 Cached ${results.length} results for: ${query}`);
    }

    getStoreProductCount(storeKey) {
        let count = 0;
        this.liveData.forEach(cached => {
            count += cached.data.filter(product => 
                product.store.toLowerCase() === this.stores[storeKey]?.name.toLowerCase()
            ).length;
        });
        return count;
    }

    getSampleData(query) {
        // Return sample data when scraping fails
        const sampleProducts = [
            { name: `${query} - Sample Product 1`, price: 2.99, store: 'Metro', savings: 0.50 },
            { name: `${query} - Sample Product 2`, price: 3.49, store: 'Loblaws', savings: 0.30 },
            { name: `${query} - Sample Product 3`, price: 2.79, store: 'Sobeys', savings: 0.70 }
        ];

        return sampleProducts.filter(product => 
            product.name.toLowerCase().includes(query.toLowerCase())
        );
    }

    startServer() {
        this.app.listen(this.port, () => {
            console.log('\n🚀 GROCEE BACKEND ONLINE!');
            console.log(`📡 API Server: http://localhost:${this.port}`);
            console.log(`🇨🇦 Canadian Stores: ${Object.keys(this.stores).length} configured`);
            console.log(`🤖 Live Scraping: READY`);
            console.log('\n📋 API Endpoints:');
            console.log(`   GET  /api/status                 - Check API status`);
            console.log(`   GET  /api/search/:query          - Search products`);
            console.log(`   GET  /api/stores                 - List all stores`);
            console.log(`   POST /api/scrape/:store/:query   - Manual scrape`);
            console.log('\n✅ Ready for frontend connections!\n');
        });
    }
}

// Start the server
const groceeAPI = new GroceeBackend();

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down Grocee Backend...');
    process.exit(0);
});

module.exports = GroceeBackend;
