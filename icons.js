import axios from 'axios';
import { load } from 'cheerio';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const CONFIG = {
    baseUrl: 'https://eu.finalfantasyxiv.com/jobguide',
    timeout: 15000,
    delayBetweenRequests: 2000,
    delayBetweenImages: 150,
    userAgent: 'FFXIV Icon Parser'
};

const JOBS = [
    { code: 'PLD', slug: 'paladin' },
    { code: 'WAR', slug: 'warrior' },
    { code: 'DRK', slug: 'darkknight' },
    { code: 'GNB', slug: 'gunbreaker' },
    { code: 'WHM', slug: 'whitemage' },
    { code: 'SCH', slug: 'scholar' },
    { code: 'AST', slug: 'astrologian' },
    { code: 'SGE', slug: 'sage' },
    { code: 'MNK', slug: 'monk' },
    { code: 'DRG', slug: 'dragoon' },
    { code: 'NIN', slug: 'ninja' },
    { code: 'SAM', slug: 'samurai' },
    { code: 'RPR', slug: 'reaper' },
    { code: 'VPR', slug: 'viper' },
    { code: 'BRD', slug: 'bard' },
    { code: 'MCH', slug: 'machinist' },
    { code: 'DNC', slug: 'dancer' },
    { code: 'BLM', slug: 'blackmage' },
    { code: 'SMN', slug: 'summoner' },
    { code: 'RDM', slug: 'redmage' },
    { code: 'PCT', slug: 'pictomancer' }
];

const Utils = {
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    
    getFilenameFromUrl(url) {
        try {
            const urlObj = new URL(url);
            return path.basename(urlObj.pathname);
        } catch (e) {
            return null;
        }
    }
};

class IconDownloader {
    constructor(jobCode, jobSlug) {
        this.jobCode = jobCode;
        this.jobSlug = jobSlug;
        this.url = `${CONFIG.baseUrl}/${jobSlug}/`;
        this.saveDir = path.join('data/icons', jobCode);
        this.downloadedUrls = new Set();
    }

    async init() {
        await mkdir(this.saveDir, { recursive: true });
    }

    async fetchPage() {
        try {
            const response = await axios.get(this.url, {
                headers: { 'User-Agent': CONFIG.userAgent },
                timeout: CONFIG.timeout
            });
            this.$ = load(response.data);
            return true;
        } catch (error) {
            console.error(`[${this.jobCode}] Ошибка загрузки страницы:`, error.message);
            return false;
        }
    }

    async downloadImage(imageUrl) {
        if (!imageUrl || this.downloadedUrls.has(imageUrl)) return false;

        const filename = Utils.getFilenameFromUrl(imageUrl);
        if (!filename) return false;

        const filepath = path.join(this.saveDir, filename);

        try {
            const response = await axios({
                url: imageUrl,
                method: 'GET',
                responseType: 'arraybuffer',
                headers: { 'User-Agent': CONFIG.userAgent },
                timeout: CONFIG.timeout
            });

            await writeFile(filepath, response.data);
            this.downloadedUrls.add(imageUrl);
            return true;
        } catch (error) {
            console.error(`[${this.jobCode}] Ошибка скачивания картинки ${filename}:`, error.message);
            return false;
        }
    }

    async parseAndDownload() {
        if (!await this.fetchPage()) return 0;
        await this.init();

        const imageElements = this.$('div.job__skill_icon img');
        let downloadedCount = 0;

        console.log(`[${this.jobCode}] Найдено ${imageElements.length} иконок (включая дубликаты). Начинаем скачивание...`);

        for (let i = 0; i < imageElements.length; i++) {
            const elem = imageElements[i];
            const imgSrc = this.$(elem).attr('src');
            
            if (imgSrc) {
                const success = await this.downloadImage(imgSrc);
                if (success) {
                    downloadedCount++;
                    await Utils.delay(CONFIG.delayBetweenImages);
                }
            }
        }

        return downloadedCount;
    }
}

class IconManager {
    constructor() {
        this.totalDownloaded = 0;
    }

    async run() {
        console.log('Запуск парсера иконок...\n');

        for (const job of JOBS) {
            const downloader = new IconDownloader(job.code, job.slug);
            const count = await downloader.parseAndDownload();
            
            console.log(`[${job.code}] Успешно сохранено: ${count} уникальных иконок.`);
            this.totalDownloaded += count;

            await Utils.delay(CONFIG.delayBetweenRequests);
        }

        console.log(`\nГОТОВО! Всего скачано ${this.totalDownloaded} иконок. Все лежат в папке 'data/icons/'.`);
    }
}

async function main() {
    try {
        const manager = new IconManager();
        await manager.run();
    } catch (error) {
        console.error('Критическая ошибка:', error);
        process.exit(1);
    }
}

main();