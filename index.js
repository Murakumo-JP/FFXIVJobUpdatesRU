import axios from 'axios';
import { load } from 'cheerio';
import { writeFile, mkdir, readFile } from 'fs/promises';

const CONFIG = {
    baseUrl: 'https://eu.finalfantasyxiv.com/jobguide',
    timeout: 15000,
    delayBetweenRequests: 2000,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
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

const isTTY = Boolean(process.stdout.isTTY);
const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};
function paint(text, ...codes) {
    if (!isTTY) return text;
    return `${codes.join('')}${text}${C.reset}`;
}

const Utils = {
    timestampToDate(timestamp) {
        const date = new Date(timestamp * 1000);
        const day = date.getUTCDate().toString().padStart(2, '0');
        const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
        const year = date.getUTCFullYear();
        return `${day}/${month}/${year}`;
    },

    getSkillKey(actionId) {
        const patterns = [
            { regex: /^pve_action__(\d+)$/, formatter: (num) => `PVE Skill ${num.padStart(2, '0')}` },
            { regex: /^pvp_action__(\d+)$/, formatter: (num) => `PVP Skill ${num.padStart(2, '0')}` },
            { regex: /^trait_action__(\d+)$/, formatter: (num) => `Trait ${num.padStart(2, '0')}` },
            { regex: /^pvplimitbreakaction_(\d+)$/, formatter: (num) => `PVP Skill LB ${num.padStart(2, '0')}` }
        ];

        for (const pattern of patterns) {
            const match = actionId.match(pattern.regex);
            if (match) {
                return pattern.formatter(match[1]);
            }
        }
        return null;
    },

    classifyKey(key) {
        if (key.startsWith('PVP Skill LB')) return 'lb';
        if (key.startsWith('PVE Skill')) return 'pve';
        if (key.startsWith('PVP Skill')) return 'pvp';
        if (key.startsWith('Trait')) return 'traits';
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

            const category = Utils.classifyKey(skillKey);
            if (category) skills[category].push(skillKey);
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

    async fetch(retries = 2) {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const response = await axios.get(this.url, {
                    headers: { 'User-Agent': CONFIG.userAgent },
                    timeout: CONFIG.timeout
                });
                this.$ = load(response.data);
                return true;
            } catch (error) {
                const isLastAttempt = attempt === retries;
                const prefix = isLastAttempt ? paint('✗', C.red) : paint('…', C.yellow);
                console.log(`      ${prefix} attempt ${attempt + 1}/${retries + 1} failed: ${paint(error.message, C.dim)}`);
                if (isLastAttempt) return false;
                await Utils.delay(CONFIG.delayBetweenRequests);
            }
        }
        return false;
    }

    async parse() {
        const ok = await this.fetch();
        const emptySkills = { pve: [], pvp: [], traits: [], lb: [] };
        if (!ok) return { ok: false, data: this.data, skills: emptySkills };

        const updateParser = new UpdateParser(this.$);

        const pveUpdate = updateParser.parseUpdateDate('div.js__select--pve', 'PVE');
        const pvpUpdate = updateParser.parseUpdateDate('div.js__select--pvp', 'PVP');

        if (pveUpdate) this.data['PVE Update'] = pveUpdate;
        if (pvpUpdate) this.data['PVP Update'] = pvpUpdate;

        const skills = updateParser.parseSkills();

        [...skills.pve, ...skills.pvp, ...skills.lb, ...skills.traits]
            .forEach(skill => this.data[skill] = true);

        return { ok: true, data: this.data, skills };
    }
}

class ParserManager {
    constructor(previousFlags = {}) {
        this.previousFlags = previousFlags;
        this.flags = {};
        this.stats = {
            processedJobs: 0,
            totalSkills: 0,
            pve: 0, pvp: 0, traits: 0, lb: 0
        };
    }

    async parseAllJobs() {
        this.printHeader();

        for (let i = 0; i < JOBS.length; i++) {
            const job = JOBS[i];
            const progress = paint(`[${(i + 1).toString().padStart(2, '0')}/${JOBS.length}]`, C.gray);
            const name = this.jobDisplayName(job).padEnd(13, ' ');

            const parser = new JobPageParser(job.slug);
            const { ok, data, skills } = await parser.parse();

            if (ok && Object.keys(data).length > 0) {
                this.flags[job.code] = data;
                this.stats.processedJobs++;
                this.updateStats(data);
                console.log(`${progress} ${name} ${paint('OK', C.green)}   ${this.formatCounts(skills)}`);
            } else if (ok) {
                this.stats.processedJobs++;
                console.log(`${progress} ${name} ${paint('no changes', C.gray)}`);
            } else if (this.previousFlags[job.code]) {
                this.flags[job.code] = this.previousFlags[job.code];
                console.log(`${progress} ${name} ${paint('fetch failed', C.red)} — using data from previous run`);
            } else {
                console.log(`${progress} ${name} ${paint('fetch failed', C.red)} — no data available`);
            }

            await Utils.delay(CONFIG.delayBetweenRequests);
        }

        return this.flags;
    }

    jobDisplayName(job) {
        return job.slug.charAt(0).toUpperCase() + job.slug.slice(1);
    }

    formatCounts(skills) {
        const parts = [];
        if (skills.pve.length) parts.push(`PVE ${skills.pve.length}`);
        if (skills.pvp.length) parts.push(`PVP ${skills.pvp.length}`);
        if (skills.traits.length) parts.push(`Traits ${skills.traits.length}`);
        if (skills.lb.length) parts.push(`LB ${skills.lb.length}`);
        return parts.length ? paint(parts.join('  ·  '), C.dim) : paint('update date only', C.dim);
    }

    printHeader() {
        const line = '─'.repeat(58);
        console.log(paint(line, C.cyan));
        console.log(paint('  FFXIV Job Guide — update parser', C.cyan + C.bold));
        console.log(paint(line, C.cyan));
    }

    updateStats(jobData) {
        const skills = Object.keys(jobData).filter(k =>
            k.includes('Skill') || k.includes('Trait')
        );
        this.stats.totalSkills += skills.length;

        skills.forEach(key => {
            const category = Utils.classifyKey(key);
            if (category) this.stats[category]++;
        });
    }

    printFinalReport() {
        const line = '─'.repeat(58);
        const row = (label, value) => console.log(`  ${label.padEnd(18, ' ')} ${paint(value, C.bold)}`);

        console.log();
        console.log(paint(line, C.cyan));
        console.log(paint('  SUMMARY', C.cyan + C.bold));
        console.log(paint(line, C.cyan));
        row('Processed:', `${this.stats.processedJobs} / ${JOBS.length} jobs`);
        row('Total flags:', this.stats.totalSkills);
        row('PVE Skills:', this.stats.pve);
        row('PVP Skills:', this.stats.pvp);
        row('Traits:', this.stats.traits);
        row('PVP Limit Break:', this.stats.lb);
        console.log(paint(line, C.cyan));
    }
}

async function main() {
    try {
        let previousFlags = {};
        try {
            const existing = await readFile('data/UpdateFlags.json', 'utf-8');
            previousFlags = JSON.parse(existing).flags || {};
        } catch {
            
        }

        const parserManager = new ParserManager(previousFlags);
        const flags = await parserManager.parseAllJobs();
        
        await mkdir('data', { recursive: true });
        
        const output = {
            generated: new Date().toISOString(),
            flags: flags
        };
        
        await writeFile('data/UpdateFlags.json', JSON.stringify(output, null, 2));
        
        parserManager.printFinalReport();
        
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

main();