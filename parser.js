import axios from 'axios';
import { load } from 'cheerio';
import { writeFile, mkdir } from 'fs/promises';

const JOBS = [
    'darkknight', 'paladin', 'warrior', 'gunbreaker',
    'whitemage', 'scholar', 'astrologian', 'sage',
    'monk', 'dragoon', 'ninja', 'samurai', 'reaper', 'viper',
    'bard', 'machinist', 'dancer',
    'blackmage', 'summoner', 'redmage', 'pictomancer'
];

function toCamelCase(job) {
    return job.charAt(0).toUpperCase() + job.slice(1);
}

async function findUpdatedActions(job) {
    try {
        console.log(`Parsing ${job}...`);
        const response = await axios.get(
            `https://eu.finalfantasyxiv.com/jobguide/${job}/`,
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
        console.error(`Error parsing ${job}:`, error.message);
        return {};
    }
}

async function main() {
    console.log('Searching for updated skills...\n');
    
    const flags = {};
    let totalSkills = 0;
    
    for (const job of JOBS) {
        const jobSkills = await findUpdatedActions(job);
        
        if (Object.keys(jobSkills).length > 0) {
            const jobKey = toCamelCase(job);
            flags[jobKey] = jobSkills;
            totalSkills += Object.keys(jobSkills).length;
            console.log(`  ${jobKey}: ${Object.keys(jobSkills).length} skills\n`);
        } else {
            console.log(`  ${job}: No updated skills\n`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    await mkdir('data', { recursive: true });
    
    const output = {
        generated: new Date().toISOString(),
        flags: flags
    };
    
    await writeFile('data/updated_flags.json', JSON.stringify(output, null, 2));
    
    console.log('='.repeat(60));
    console.log('FINAL RESULT:');
    console.log('='.repeat(60));
    
    if (Object.keys(flags).length === 0) {
        console.log('❌ No updated skills found.');
    } else {
        console.log(`✅ Found updated skills in ${Object.keys(flags).length} jobs.`);
        console.log(`📊 Total skills with updates: ${totalSkills}\n`);
        
        Object.entries(flags).forEach(([job, jobFlags]) => {
            console.log(`${job}:`);
            Object.keys(jobFlags).forEach(skillKey => {
                console.log(`  ${skillKey}`);
            });
            console.log('');
        });
    }
    
    console.log('💾 Saved to data/updated_flags.json');
    console.log('='.repeat(60));
    
    console.log('\nFile structure preview:');
    console.log(JSON.stringify({
        generated: output.generated,
        flags: Object.keys(flags).reduce((acc, job) => {
            acc[job] = { 
                count: Object.keys(flags[job]).length,
                example: Object.keys(flags[job])[0] || 'none'
            };
            return acc;
        }, {})
    }, null, 2));
}

main();