import axios from 'axios';
import { load } from 'cheerio';
import { writeFile, mkdir } from 'fs/promises';

const JOBS = [
    { code: 'DRK', slug: 'darkknight' },
    { code: 'PLD', slug: 'paladin' },
    { code: 'WAR', slug: 'warrior' },
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

function timestampToDate(timestamp) {
    const date = new Date(timestamp * 1000);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function getSkillKey(actionId) {
    if (actionId.startsWith('pve_action__')) {
        const match = actionId.match(/pve_action__(\d+)/);
        if (match) {
            const number = match[1];
            return `PVE Skill ${number.padStart(2, '0')}`;
        }
    }
    else if (actionId.startsWith('pvp_action__')) {
        const match = actionId.match(/pvp_action__(\d+)/);
        if (match) {
            const number = match[1];
            return `PVP Skill ${number.padStart(2, '0')}`;
        }
    }
    else if (actionId.startsWith('trait_action__')) {
        const match = actionId.match(/trait_action__(\d+)/);
        if (match) {
            const number = match[1];
            return `Trait ${number.padStart(2, '0')}`;
        }
    }
    else if (actionId.startsWith('pvplimitbreakaction_')) {
        const match = actionId.match(/pvplimitbreakaction_(\d+)/);
        if (match) {
            const number = parseInt(match[1]);
            return `PVP Skill LB${number}`;
        }
    }
    return null;
}

async function parseJobPage(jobSlug) {
    try {
        console.log(`Парсинг ${jobSlug}...`);
        const response = await axios.get(
            `https://eu.finalfantasyxiv.com/jobguide/${jobSlug}/`,
            { headers: { 'User-Agent': 'FFXIV Parser' }, timeout: 15000 }
        );
        
        const $ = load(response.data);
        const jobData = {};
        
        const $pveSection = $('div.js__select--pve');
        if ($pveSection.length) {
            const $pveUpdate = $pveSection.find('p.job__update');
            if ($pveUpdate.length) {
                const $span = $pveUpdate.find('span[id^="datetime-"]');
                if ($span.length) {
                    const spanId = $span.attr('id');
                    const scriptText = $('script').filter((i, el) => {
                        return $(el).text().includes(`document.getElementById('${spanId}')`);
                    }).text();
                    
                    if (scriptText) {
                        const timestampMatch = scriptText.match(/ldst_strftime\((\d+),\s*'YMD'\)/);
                        if (timestampMatch) {
                            const timestamp = parseInt(timestampMatch[1]);
                            const dateStr = timestampToDate(timestamp);
                            jobData['PVE Update'] = `Последнее обновление: ${dateStr}`;
                        }
                    }
                }
            }
        }
        
        const $pvpSection = $('div.js__select--pvp');
        if ($pvpSection.length) {
            const $pvpUpdate = $pvpSection.find('p.job__update');
            if ($pvpUpdate.length) {
                const $span = $pvpUpdate.find('span[id^="datetime-"]');
                if ($span.length) {
                    const spanId = $span.attr('id');
                    const scriptText = $('script').filter((i, el) => {
                        return $(el).text().includes(`document.getElementById('${spanId}')`);
                    }).text();
                    
                    if (scriptText) {
                        const timestampMatch = scriptText.match(/ldst_strftime\((\d+),\s*'YMD'\)/);
                        if (timestampMatch) {
                            const timestamp = parseInt(timestampMatch[1]);
                            const dateStr = timestampToDate(timestamp);
                            jobData['PVP Update'] = `Последнее обновление: ${dateStr}`;
                        }
                    }
                }
            }
        }
        
        let skillCount = 0;
        let pveCount = 0;
        let pvpCount = 0;
        let traitCount = 0;
        let lbCount = 0;
        
        $('tr.update.js__jobguide_update_one.hide').each((i, elem) => {
            const $row = $(elem);
            const timestamp = $row.attr('data-updated');
            
            if (timestamp && parseInt(timestamp) > 0) {
                const $nextRow = $row.next();
                const actionId = $nextRow.attr('id');
                
                if (actionId) {
                    const skillKey = getSkillKey(actionId);
                    if (skillKey) {
                        jobData[skillKey] = true;
                        skillCount++;
                        
                        if (skillKey.startsWith('PVE Skill')) pveCount++;
                        else if (skillKey.startsWith('PVP Skill LB')) lbCount++;
                        else if (skillKey.startsWith('PVP Skill')) pvpCount++;
                        else if (skillKey.startsWith('Trait')) traitCount++;
                    }
                }
            }
        });
        
        const updateCount = Object.keys(jobData).filter(k => k.includes('Update')).length;
        console.log(`  Найдено: ${updateCount} дат, ${skillCount} скиллов`);
        console.log(`    PVE: ${pveCount}, PVP: ${pvpCount}, Traits: ${traitCount}, LB: ${lbCount}`);
        
        if (updateCount > 0) {
            Object.entries(jobData).forEach(([key, value]) => {
                if (key.includes('Update')) {
                    console.log(`    ${key}: ${value}`);
                }
            });
        }
        
        if (skillCount > 0) {
            Object.entries(jobData).forEach(([key, value]) => {
                if (key.includes('Skill') || key.includes('Trait')) {
                    console.log(`    ${key}: ${value}`);
                }
            });
        }
        
        return jobData;
        
    } catch (error) {
        console.error(`Ошибка парсинга ${jobSlug}:`, error.message);
        return {};
    }
}

async function main() {
    console.log('Запуск парсера...\n');
    
    const flags = {};
    let processedJobs = 0;
    let totalSkills = 0;
    let totalPve = 0;
    let totalPvp = 0;
    let totalTraits = 0;
    let totalLb = 0;
    
    for (const job of JOBS) {
        const jobData = await parseJobPage(job.slug);
        
        if (Object.keys(jobData).length > 0) {
            flags[job.code] = jobData;
            processedJobs++;
            
            const skills = Object.keys(jobData).filter(k => k.includes('Skill') || k.includes('Trait')).length;
            totalSkills += skills;
            
            Object.keys(jobData).forEach(key => {
                if (key.startsWith('PVE Skill') && !key.includes('LB')) totalPve++;
                else if (key.startsWith('PVP Skill LB')) totalLb++;
                else if (key.startsWith('PVP Skill')) totalPvp++;
                else if (key.startsWith('Trait')) totalTraits++;
            });
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    await mkdir('data', { recursive: true });
    
    const output = {
        generated: new Date().toISOString(),
        flags: flags
    };
    
    await writeFile('data/Update.json', JSON.stringify(output, null, 2));
    
    console.log(`\nГотово! Обработано ${processedJobs} из ${JOBS.length} классов.`);
    console.log(`Всего найдено: ${totalSkills} элементов`);
    console.log(`  PVE Skills: ${totalPve}`);
    console.log(`  PVP Skills: ${totalPvp}`);
    console.log(`  Traits: ${totalTraits}`);
    console.log(`  PVP Limit Break: ${totalLb}`);
}

main().catch(error => {
    console.error('Критическая ошибка:', error);
    process.exit(1);
});