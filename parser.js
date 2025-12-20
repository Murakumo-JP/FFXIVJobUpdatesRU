const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;

// Все классы для парсинга
const JOBS = [
    'darkknight', 'paladin', 'warrior', 'gunbreaker',
    'whitemage', 'scholar', 'astrologian', 'sage',
    'monk', 'dragoon', 'ninja', 'samurai', 'reaper', 'viper',
    'bard', 'machinist', 'dancer',
    'blackmage', 'summoner', 'redmage', 'pictomancer',
    'bluemage'
];

async function parseJob(job) {
    try {
        console.log(`Parsing ${job}...`);
        const url = `https://eu.finalfantasyxiv.com/jobguide/${job}/`;
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (FFXIV Parser)'
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        const updates = [];
        
        // Ищем обновленные строки
        $('tr.update.js__jobguide_update_one.hide').each((i, elem) => {
            const $row = $(elem);
            const timestamp = $row.attr('data-updated');
            
            if (timestamp) {
                // Ищем следующее действие
                const $next = $row.next();
                const actionId = $next.attr('id');
                
                if (actionId && actionId.startsWith('pve_action__')) {
                    const actionName = $next.find('.sys_action_name').text().trim();
                    const actionDesc = $next.find('.sys_action_desc').text().trim();
                    
                    updates.push({
                        job,
                        action_id: actionId,
                        action_name: actionName,
                        action_desc: actionDesc,
                        updated_at: parseInt(timestamp) * 1000,
                        updated_date: new Date(parseInt(timestamp) * 1000).toISOString(),
                        is_new: $row.attr('data-new') === '1',
                        url
                    });
                }
            }
        });
        
        console.log(`  Found ${updates.length} updates`);
        return updates;
        
    } catch (error) {
        console.error(`Error parsing ${job}:`, error.message);
        return [];
    }
}

async function main() {
    console.log('Starting FFXIV job parser...\n');
    
    const allUpdates = [];
    const startTime = Date.now();
    
    // Парсим все классы с задержкой
    for (const job of JOBS) {
        const updates = await parseJob(job);
        allUpdates.push(...updates);
        
        // Задержка 1.5 секунды между запросами
        await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    // Создаем директорию если нет
    await fs.mkdir('data', { recursive: true });
    
    // Сохраняем результаты
    const result = {
        generated_at: new Date().toISOString(),
        total_updates: allUpdates.length,
        jobs_parsed: JOBS.length,
        data: allUpdates
    };
    
    await fs.writeFile(
        'data/updates.json',
        JSON.stringify(result, null, 2)
    );
    
    // Также сохраняем в CSV для удобства
    if (allUpdates.length > 0) {
        const csv = [
            'job,action_id,action_name,updated_date,is_new,url',
            ...allUpdates.map(u => 
                `"${u.job}","${u.action_id}","${u.action_name}",` +
                `"${u.updated_date}","${u.is_new}","${u.url}"`
            )
        ].join('\n');
        
        await fs.writeFile('data/updates.csv', csv);
    }
    
    const timeTaken = (Date.now() - startTime) / 1000;
    console.log(`\n✅ Done! Parsed ${JOBS.length} jobs in ${timeTaken}s`);
    console.log(`📊 Found ${allUpdates.length} updates`);
    console.log(`💾 Saved to data/updates.json and data/updates.csv`);
}

// Запуск
main().catch(console.error);