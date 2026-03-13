
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testExplicitInsert() {
    const randomCode = 'TEST-EXP-' + Math.floor(Math.random() * 100000);
    console.log("Testing Supabase Explicit ID Insert with code:", randomCode);

    const payload = {
        id: 9999,
        staff_name: 'Test User Explicit',
        amount: 10.50,
        nab_code: randomCode,
        full_email_content: 'Test content explicit',
        created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
        .from('audit_logs')
        .insert([payload])
        .select();

    if (error) {
        console.error("Insert Error:", JSON.stringify(error, null, 2));
    } else {
        console.log("Insert Success:", data);
    }
}

testExplicitInsert();
