import axios from 'axios';
import { load } from 'cheerio';
import { writeFile, mkdir } from 'fs/promises';

const JOBS = [
    'darkknight', 'paladin', 'warrior', 'gunbreaker',
    'whitemage', 'scholar', 'astrologian', 'sage',
    'monk', 'dragoon', 'ninja', 'samurai', 'reaper', 'viper',
    'bard', 'machinist', 'dancer',
    'blackmage', 'summoner', 'redmage', 'pictomancer',
    'bluemage'
];

async function findUpdatedActions(job) {
    try {
        console.log(`Parsing ${job}...`);
        const response = await axios.get(
            `https://eu.finalfantasyxiv.com/jobguide/${job}/`,
            { headers: { 'User-Agent': 'FFXIV Parser' }, timeout: 15000 }
        );
        
        const $ = load(response.data);
        const updatedSkills = [];
        
        // Ищем обновлённые строки с timestamp > 0
        $('tr.update.js__jobguide_update_one.hide').each((i, elem) => {
            const $row = $(elem);
            const timestamp = $row.attr('data-updated');
            
            // ТОЛЬКО если timestamp существует и > 0
            if (timestamp && parseInt(timestamp) > 0) {
                const $nextRow = $row.next();
                const actionId = $nextRow.attr('id');
                
                if (actionId && actionId.startsWith('pve_action__')) {
                    // Извлекаем число из pve_action__XX
                    const match = actionId.match(/pve_action__(\d+)/);
                    if (match) {
                        const number = match[1];
                        const skillName = `PVE Skill ${number}`;
                        console.log(`  ✓ ${actionId} → ${skillName}`);
                        updatedSkills.push(skillName);
                    }
                }
            }
        });
        
        return updatedSkills;
        
    } catch (error) {
        console.error(`Error parsing ${job}:`, error.message);
        return [];
    }
}

async function main() {
    console.log('Searching for updated PVE Skills...\n');
    
    const results = [];
    
    for (const job of JOBS) {
        const skills = await findUpdatedActions(job);
        
        if (skills.length > 0) {
            // Создаём объект для этого класса
            const jobObj = { job: job };
            
            // Добавляем PVE Skill 1, PVE Skill 2 и т.д.
            skills.forEach((skill, index) => {
                jobObj[`PVE Skill ${index + 1}`] = skill;
            });
            
            results.push(jobObj);
            console.log(`  Found: ${skills.length} updated skills\n`);
        } else {
            console.log(`  No updated skills\n`);
        }
        
        // Пауза
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Создаем папку если нет
    await mkdir('data', { recursive: true });
    
    // Сохраняем результат
    const output = {
        generated: new Date().toISOString(),
        data: results
    };
    
    await writeFile('data/updated.json', JSON.stringify(output, null, 2));
    
    console.log('='.repeat(60));
    console.log('FINAL RESULT:');
    console.log('='.repeat(60));
    
    if (results.length === 0) {
        console.log('❌ No updated PVE Skills found.');
    } else {
        console.log(`✅ Found updated PVE Skills in ${results.length} jobs.\n`);
        
        // Показываем результат
        results.forEach(jobData => {
            console.log(`${jobData.job}:`);
            Object.entries(jobData).forEach(([key, value]) => {
                if (key.startsWith('PVE Skill')) {
                    console.log(`  ${key}: ${value}`);
                }
            });
            console.log('');
        });
    }
    
    console.log('💾 Saved to data/updated_skills.json');
    console.log('='.repeat(60));
    
    // Показываем как выглядит JSON
    console.log('\nJSON output preview:');
    console.log(JSON.stringify(output, null, 2));
}

main();