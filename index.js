import axios from 'axios';
import { load } from 'cheerio';
import { writeFile, mkdir } from 'fs/promises';

const CONFIG = {
    baseUrl: 'https://eu.finalfantasyxiv.com/jobguide',
    timeout: 15000,
    delayBetweenRequests: 2000,
    userAgent: 'FFXIV Parser'
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
    timestampToDate(timestamp) {
        const date = new Date(timestamp * 1000);
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    },

    getSkillKey(actionId) {
        const patterns = [
            { regex: /^pve_action__(\d+)$/, formatter: (num) => `PVE Skill ${num.padStart(2, '0')}` },
            { regex: /^pvp_action__(\d+)$/, formatter: (num) => `PVP Skill ${num.padStart(2, '0')}` },
            { regex: /^trait_action__(\d+)$/, formatter: (num) => `Trait ${num.padStart(2, '0')}` },
            { regex: /^pvplimitbreakaction_(\d+)$/, formatter: (num) => `PVP Skill LB${parseInt(num)}` }
        ];

        for (const pattern of patterns) {
            const match = actionId.match(pattern.regex);
            if (match) {
                return pattern.formatter(match[1]);
            }
        }
        return null;
    },

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

class UpdateParser {
    constructor($) {
        this.$ = $;
    }

        parseUpdateDate(section, type) {
        const $section = this.$(section);
        if (!$section.length) return null;

        const $update = $section.find('p.job__update');
        if (!$update.length) return null;

        const $span = $update.find('span[id^="datetime-"]');
        if (!$span.length) return null;

        const spanId = $span.attr('id');
        const scriptText = this.$('script').filter((i, el) => {
            return this.$(el).text().includes(`document.getElementById('${spanId}')`);
        }).text();

        if (!scriptText) return null;

        const timestampMatch = scriptText.match(/ldst_strftime\((\d+),\s*'YMD'\)/);
        if (!timestampMatch) return null;

        const timestamp = parseInt(timestampMatch[1]);
        const dateStr = Utils.timestampToDate(timestamp);
        return `Последнее обновление: ${dateStr}`;
    }

    parseSkills() {
        const skills = {
            pve: [], pvp: [], traits: [], lb: []
        };

        this.$('tr.update.js__jobguide_update_one.hide').each((i, elem) => {
            const $row = this.$(elem);
            const timestamp = $row.attr('data-updated');
            
            if (!timestamp || parseInt(timestamp) <= 0) return;

            const $nextRow = $row.next();
            const actionId = $nextRow.attr('id');
            if (!actionId) return;

            const skillKey = Utils.getSkillKey(actionId);
            if (!skillKey) return;

            if (skillKey.startsWith('PVE Skill')) skills.pve.push(skillKey);
            else if (skillKey.startsWith('PVP Skill LB')) skills.lb.push(skillKey);
            else if (skillKey.startsWith('PVP Skill')) skills.pvp.push(skillKey);
            else if (skillKey.startsWith('Trait')) skills.traits.push(skillKey);
        });

        return skills;
    }
}

class JobPageParser {
    constructor(jobSlug) {
        this.jobSlug = jobSlug;
        this.url = `${CONFIG.baseUrl}/${jobSlug}/`;
        this.data = {};
    }

    async fetch() {
        try {
            const response = await axios.get(this.url, {
                headers: { 'User-Agent': CONFIG.userAgent },
                timeout: CONFIG.timeout
            });
            this.$ = load(response.data);
            return true;
        } catch (error) {
            console.error(`Ошибка загрузки ${this.jobSlug}:`, error.message);
            return false;
        }
    }

    async parse() {
        if (!await this.fetch()) return this.data;

        const updateParser = new UpdateParser(this.$);
        
        const pveUpdate = updateParser.parseUpdateDate('div.js__select--pve', 'PVE');
        const pvpUpdate = updateParser.parseUpdateDate('div.js__select--pvp', 'PVP');
        
        if (pveUpdate) this.data['PVE Update'] = pveUpdate;
        if (pvpUpdate) this.data['PVP Update'] = pvpUpdate;

        const skills = updateParser.parseSkills();
        
        [...skills.pve, ...skills.pvp, ...skills.lb, ...skills.traits]
            .forEach(skill => this.data[skill] = true);

        this.printStats(skills);
        return this.data;
    }

    printStats(skills) {
        const updateCount = Object.keys(this.data).filter(k => k.includes('Update')).length;
        const skillCount = Object.keys(this.data).filter(k => 
            k.includes('Skill') || k.includes('Trait')
        ).length;

        console.log(`Найдено: ${updateCount} дат, ${skillCount} умений`);
        console.log(`PVE: ${skills.pve.length}, PVP: ${skills.pvp.length}, Traits: ${skills.traits.length}, LB: ${skills.lb.length}`);

        if (updateCount > 0) {
            Object.entries(this.data).forEach(([key, value]) => {
                if (key.includes('Update')) {
                    console.log(`    ${key}: ${value}`);
                }
            });
        }

        if (skillCount > 0) {
            console.log('Умение:', Object.keys(this.data)
                .filter(k => k.includes('Skill') || k.includes('Trait'))
                .join(', '));
        }
    }
}

class ParserManager {
    constructor() {
        this.flags = {};
        this.stats = {
            processedJobs: 0,
            totalSkills: 0,
            pve: 0, pvp: 0, traits: 0, lb: 0
        };
    }

    async parseAllJobs() {
        console.log('Запуск парсера...\n');

        for (const job of JOBS) {
            console.log(`Парсинг ${job.slug}...`);
            
            const parser = new JobPageParser(job.slug);
            const jobData = await parser.parse();

            if (Object.keys(jobData).length > 0) {
                this.flags[job.code] = jobData;
                this.stats.processedJobs++;
                this.updateStats(jobData);
            }

            await Utils.delay(CONFIG.delayBetweenRequests);
        }

        return this.flags;
    }

    updateStats(jobData) {
        const skills = Object.keys(jobData).filter(k => 
            k.includes('Skill') || k.includes('Trait')
        );
        this.stats.totalSkills += skills.length;

        skills.forEach(key => {
            if (key.startsWith('PVE Skill') && !key.includes('LB')) this.stats.pve++;
            else if (key.startsWith('PVP Skill LB')) this.stats.lb++;
            else if (key.startsWith('PVP Skill')) this.stats.pvp++;
            else if (key.startsWith('Trait')) this.stats.traits++;
        });
    }

    printFinalReport() {
        console.log(`\nОТЧЕТ:`);
        console.log(`Обработано ${this.stats.processedJobs} из ${JOBS.length} классов`);
        console.log(`Всего найдено: ${this.stats.totalSkills} флагов`);
        console.log(`PVE Skills: ${this.stats.pve}`);
        console.log(`PVP Skills: ${this.stats.pvp}`);
        console.log(`Traits: ${this.stats.traits}`);
        console.log(`PVP Limit Break: ${this.stats.lb}`);
    }
}

async function main() {
    try {
        const parserManager = new ParserManager();
        const flags = await parserManager.parseAllJobs();
        
        await mkdir('data', { recursive: true });
        
        const output = {
            generated: new Date().toISOString(),
            flags: flags
        };
        
        await writeFile('data/UpdateFlags.json', JSON.stringify(output, null, 2));
        
        parserManager.printFinalReport();
        
    } catch (error) {
        console.error('Критическая ошибка:', error);
        process.exit(1);
    }
}

main();