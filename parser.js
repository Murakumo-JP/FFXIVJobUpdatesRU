import axios from 'axios';
import { load } from 'cheerio';
import { writeFile, mkdir } from 'fs/promises';

// Список классов и их коды
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

async function findUpdatedActions(jobSlug) {
    try {
        console.log(`Парсинг ${jobSlug}...`);
        const response = await axios.get(
            `https://eu.finalfantasyxiv.com/jobguide/${jobSlug}/`,
            { headers: { 'User-Agent': 'FFXIV Parser' }, timeout: 15000 }
        );
        
        const $ = load(response.data);
        const updatedSkills = {};
        
        $('tr.update.js__jobguide_update_one.hide').each((i, elem) => {
            const $row = $(elem);
            const timestamp = $row.attr('data-updated');
            
            if (timestamp && parseInt(timestamp) > 0) {
                const $nextRow = $row.next();
                const actionId = $nextRow.attr('id');
                
                if (actionId) {
                    if (actionId.startsWith('pve_action__')) {
                        const match = actionId.match(/pve_action__(\d+)/);
                        if (match) {
                            const number = match[1];
                            const skillKey = `PVE Skill ${number.padStart(2, '0')}`;
                            console.log(`  ✓ ${actionId} → ${skillKey}`);
                            updatedSkills[skillKey] = true;
                        }
                    }
                    else if (actionId.startsWith('pvp_action__')) {
                        const match = actionId.match(/pvp_action__(\d+)/);
                        if (match) {
                            const number = match[1];
                            const skillKey = `PVP Skill ${number.padStart(2, '0')}`;
                            console.log(`  ✓ ${actionId} → ${skillKey}`);
                            updatedSkills[skillKey] = true;
                        }
                    }
                }
            }
        });
        
        return updatedSkills;
        
    } catch (error) {
        console.error(`Ошибка парсинга ${jobSlug}:`, error.message);
        return {};
    }
}

async function main() {
    console.log('FFXIV Job Updates Parser\n');
    console.log('='.repeat(60));
    
    const flags = {};
    let updatedJobs = 0;
    let totalSkills = 0;
    
    for (const job of JOBS) {
        const jobSkills = await findUpdatedActions(job.slug);
        
        if (Object.keys(jobSkills).length > 0) {
            // Сохраняем только под кодом класса (DRK, PLD и т.д.)
            flags[job.code] = jobSkills;
            
            updatedJobs++;
            totalSkills += Object.keys(jobSkills).length;
            console.log(`  ✅ ${job.code}: ${Object.keys(jobSkills).length} обновлённых скиллов\n`);
        } else {
            console.log(`  ❌ ${job.code}: Нет обновлений\n`);
        }
        
        // Пауза между запросами
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Создаём папку для данных
    await mkdir('data', { recursive: true });
    
    // Сохраняем результат
    const output = {
        generated: new Date().toISOString(),
        total_jobs_updated: updatedJobs,
        total_skills_updated: totalSkills,
        flags: flags
    };
    
    await writeFile('data/updated_flags.json', JSON.stringify(output, null, 2));
    
    console.log('='.repeat(60));
    console.log('📊 РЕЗУЛЬТАТЫ:');
    console.log('='.repeat(60));
    
    if (updatedJobs === 0) {
        console.log('❌ Не найдено обновлённых скиллов.');
    } else {
        console.log(`✅ Обновлено ${updatedJobs} из ${JOBS.length} классов`);
        console.log(`📈 Всего обновлённых скиллов: ${totalSkills}`);
        
        // Выводим список обновлённых классов
        console.log('\n📋 Классы с обновлениями:');
        JOBS.forEach(job => {
            if (flags[job.code]) {
                const count = Object.keys(flags[job.code]).length;
                const skills = Object.keys(flags[job.code]).join(', ');
                console.log(`  • ${job.code}: ${count} скилл(ов) - ${skills}`);
            }
        });
    }
    
    console.log('\n💾 Сохранено в: data/updated_flags.json');
    console.log('='.repeat(60));
}

main().catch(error => {
    console.error('Критическая ошибка:', error);
    process.exit(1);
});