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
        const updatedActions = [];
        
        // Проходим по ВСЕМ строкам таблицы
        $('tr').each((i, elem) => {
            const $row = $(elem);
            const rowClass = $row.attr('class') || '';
            
            // Если это строка с классом update И hide
            if (rowClass.includes('update') && 
                rowClass.includes('js__jobguide_update_one') && 
                rowClass.includes('hide')) {
                
                // Получаем timestamp
                const timestamp = $row.attr('data-updated');
                const timestampNum = parseInt(timestamp);
                
                // Фильтруем: timestamp должен быть > 0 (не 0 и не пустой)
                if (timestamp && timestampNum > 0) {
                    // Берём следующую строку
                    const $nextRow = $row.next();
                    const nextRowId = $nextRow.attr('id');
                    
                    // Проверяем что следующая строка - pve_action__
                    if (nextRowId && nextRowId.startsWith('pve_action__')) {
                        console.log(`  ✓ Found: ${nextRowId} (timestamp: ${timestamp})`);
                        updatedActions.push({
                            id: nextRowId,
                            timestamp: timestamp
                        });
                    }
                } else if (timestamp === '0') {
                    // Пропускаем - это не обновление
                    const $nextRow = $row.next();
                    const nextRowId = $nextRow.attr('id');
                    if (nextRowId && nextRowId.startsWith('pve_action__')) {
                        console.log(`  ✗ Skipped: ${nextRowId} (timestamp is 0)`);
                    }
                }
            }
        });
        
        return updatedActions;
        
    } catch (error) {
        console.error(`Error parsing ${job}:`, error.message);
        return [];
    }
}

async function main() {
    console.log('Searching for updated pve_action__ elements (timestamp > 0)...\n');
    
    const results = [];
    
    for (const job of JOBS) {
        const actions = await findUpdatedActions(job);
        
        if (actions.length > 0) {
            // Создаём объект для этого класса
            const jobObj = { job: job };
            
            // Добавляем action_id_1, action_id_2 и т.д.
            actions.forEach((action, index) => {
                jobObj[`action_id_${index + 1}`] = action.id;
                // Можно также сохранить timestamp если нужно
                jobObj[`timestamp_${index + 1}`] = action.timestamp;
            });
            
            results.push(jobObj);
            console.log(`  Total for ${job}: ${actions.length} updated actions\n`);
        } else {
            console.log(`  No updated actions found for ${job}\n`);
        }
        
        // Пауза
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Сохраняем
    await mkdir('data', { recursive: true });
    
    const output = {
        generated: new Date().toISOString(),
        data: results
    };
    
    await writeFile('data/updated_actions.json', JSON.stringify(output, null, 2));
    
    console.log('='.repeat(70));
    console.log('FINAL RESULT (only actions with timestamp > 0):');
    console.log('='.repeat(70));
    
    if (results.length === 0) {
        console.log('❌ No updated actions found on any job page.');
    } else {
        console.log(`✅ Found updated actions in ${results.length} jobs.`);
        results.forEach(jobData => {
            const actionCount = (Object.keys(jobData).length - 1) / 2; // минус поле job, делим на 2 (id + timestamp)
            console.log(`\n${jobData.job}: ${actionCount} action(s)`);
            
            // Показываем какие именно
            Object.entries(jobData).forEach(([key, value]) => {
                if (key.startsWith('action_id_')) {
                    const num = key.replace('action_id_', '');
                    const timestamp = jobData[`timestamp_${num}`] || 'no timestamp';
                    console.log(`  ${key}: ${value} (timestamp: ${timestamp})`);
                }
            });
        });
    }
    
    console.log('\n💾 Saved to data/updated_actions.json');
    console.log('='.repeat(70));
}

main();